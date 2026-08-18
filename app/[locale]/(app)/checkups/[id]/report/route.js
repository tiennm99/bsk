/**
 * Ultrasound / imaging report PDF — Node-runtime Route Handler. Renders a
 * Vietnamese-capable PDF (Be Vietnam Pro) with the checkup's diagnosis,
 * conclusion, and up to 4 embedded images. Enrolled staff only.
 *
 * Images are downloaded server-side (signed URL -> fetch -> Buffer) because
 * react-pdf cannot reliably fetch a private signed URL at render time in
 * every runtime; any image that fails to download is skipped rather than
 * failing the whole report.
 */

import { getTranslations } from "next-intl/server";
import { getServerSession } from "@/lib/auth/get-server-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CHECKUP_MEDIA_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/lib/imaging/image-schema";
import { computeAge } from "@/lib/pdf/patient-info";
import { renderUltrasoundPdf } from "@/lib/pdf/ultrasound-document";

/** @typedef {import('@/lib/pdf/ultrasound-document').UltrasoundImage} UltrasoundImage */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REPORT_IMAGES = 4;

/**
 * @param {Request} _req
 * @param {{ params: Promise<{ locale: string, id: string }> }} context
 */
export async function GET(_req, { params }) {
  const { id } = await params;
  const checkupId = Number(id);
  if (!Number.isFinite(checkupId)) return new Response("Not found", { status: 404 });

  const session = await getServerSession();
  if (!session?.role) return new Response("Forbidden", { status: 403 });

  const supabase = await createSupabaseServerClient();

  const [{ data: c }, { data: clinic }] = await Promise.all([
    supabase
      .from("checkups")
      .select("id, customer_id, checkup_date, diagnosis, conclusion, doctor_id, template_id")
      .eq("id", checkupId)
      .eq("deleted", false)
      .maybeSingle(),
    supabase.from("clinic_settings").select("name, address, phone").eq("id", true).maybeSingle(),
  ]);
  if (!c) return new Response("Not found", { status: 404 });

  const [{ data: customer }, { data: doctor }, { data: template }, { data: images }] =
    await Promise.all([
      supabase
        .from("customers")
        .select("last_name, first_name, dob, gender")
        .eq("id", c.customer_id)
        .maybeSingle(),
      c.doctor_id
        ? supabase
            .from("doctors")
            .select("last_name, first_name")
            .eq("id", c.doctor_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      c.template_id
        ? supabase.from("checkup_templates").select("title").eq("id", c.template_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("checkup_images")
        .select("id, storage_path, created_at")
        .eq("checkup_id", checkupId)
        .eq("deleted", false)
        .order("created_at", { ascending: false })
        .limit(MAX_REPORT_IMAGES),
    ]);

  const t = await getTranslations("reports");
  const tPatients = await getTranslations("patients");

  const downloaded = await Promise.all(
    (images ?? []).map(
      /** @returns {Promise<UltrasoundImage | null>} */
      async (img) => {
        const { data: signed } = await supabase.storage
          .from(CHECKUP_MEDIA_BUCKET)
          .createSignedUrl(img.storage_path, SIGNED_URL_TTL_SECONDS);
        if (!signed?.signedUrl) return null;
        try {
          const res = await fetch(signed.signedUrl);
          if (!res.ok) return null;
          const arrayBuffer = await res.arrayBuffer();
          return { data: Buffer.from(arrayBuffer), format: "jpg" };
        } catch {
          return null;
        }
      },
    ),
  );
  /** @type {UltrasoundImage[]} */
  const reportImages = downloaded.filter(
    /** @returns {img is UltrasoundImage} */ (img) => img != null,
  );

  const buffer = await renderUltrasoundPdf({
    clinicName: clinic?.name ?? "",
    clinicAddress: clinic?.address ?? "",
    clinicPhone: clinic?.phone ?? "",
    title: template?.title ?? t("ultrasoundReport"),
    patientName: customer ? `${customer.last_name} ${customer.first_name}` : "—",
    patientDob: customer?.dob ?? null,
    patientAge: computeAge(customer?.dob ?? null),
    patientGender: customer?.gender ? tPatients(`gender.${customer.gender}`) : null,
    date: c.checkup_date,
    diagnosis: c.diagnosis,
    conclusion: c.conclusion,
    doctorName: doctor ? `${doctor.last_name} ${doctor.first_name}` : null,
    images: reportImages,
    labels: {
      patient: t("patient"),
      date: t("date"),
      dob: tPatients("dob"),
      age: t("age"),
      gender: t("gender"),
      diagnosis: t("diagnosis"),
      conclusion: t("conclusion"),
      doctor: t("doctor"),
      signature: t("signature"),
    },
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="report-${checkupId}.pdf"`,
    },
  });
}
