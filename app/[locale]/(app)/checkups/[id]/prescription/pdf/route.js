/**
 * Prescription PDF — Node-runtime Route Handler. Renders a Vietnamese-capable
 * PDF (Be Vietnam Pro) of a checkup's medicine order lines with dosage
 * prominent and NO prices — this is a prescription, not an invoice. Enrolled
 * staff only.
 */

import { getTranslations } from "next-intl/server";
import { getServerSession } from "@/lib/auth/get-server-session";
import { clinicalRoles } from "@/lib/db/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { computeAge } from "@/lib/pdf/patient-info";
import { renderPrescriptionPdf } from "@/lib/pdf/prescription-document";

/** @typedef {import('@/lib/pdf/prescription-document').PrescriptionMedicineLine} PrescriptionMedicineLine */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * @param {Request} _req
 * @param {{ params: Promise<{ locale: string, id: string }> }} context
 */
export async function GET(_req, { params }) {
  const { id } = await params;
  const checkupId = Number(id);
  if (!Number.isFinite(checkupId)) return new Response("Not found", { status: 404 });

  // Clinical gate, matching checkups/layout.jsx — this PDF embeds diagnosis,
  // medicines, and the patient's address.
  const session = await getServerSession();
  if (!session?.role || !clinicalRoles.includes(session.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const supabase = await createSupabaseServerClient();

  const [{ data: c }, { data: clinic }] = await Promise.all([
    supabase
      .from("checkups")
      .select("id, customer_id, checkup_date, diagnosis, doctor_id")
      .eq("id", checkupId)
      .eq("deleted", false)
      .maybeSingle(),
    supabase.from("clinic_settings").select("name, address, phone").eq("id", true).maybeSingle(),
  ]);
  if (!c) return new Response("Not found", { status: 404 });

  const [{ data: customer }, { data: items }, { data: doctor }] = await Promise.all([
    supabase
      .from("customers")
      .select("last_name, first_name, dob, gender, address_detail, province_code, ward_code")
      .eq("id", c.customer_id)
      .eq("deleted", false)
      .maybeSingle(),
    supabase
      .from("order_items")
      .select("medicine_id, quantity, dosage")
      .eq("checkup_id", checkupId),
    c.doctor_id
      ? supabase.from("doctors").select("last_name, first_name").eq("id", c.doctor_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const [{ data: province }, { data: ward }] = await Promise.all([
    customer?.province_code
      ? supabase.from("provinces").select("name").eq("code", customer.province_code).maybeSingle()
      : Promise.resolve({ data: null }),
    customer?.ward_code
      ? supabase.from("wards").select("name").eq("code", customer.ward_code).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const medIds = [...new Set((items ?? []).map((i) => i.medicine_id))];
  const { data: meds } = medIds.length
    ? await supabase.from("medicines").select("id, name, unit").in("id", medIds)
    : { data: [] };
  const medById = new Map((meds ?? []).map((m) => [m.id, m]));

  /** @type {PrescriptionMedicineLine[]} */
  const medicines = (items ?? []).map((i) => {
    const med = medById.get(i.medicine_id);
    return {
      name: med?.name ?? "—",
      unit: med?.unit ?? null,
      quantity: i.quantity,
      dosage: i.dosage ?? "",
    };
  });

  const patientAddress =
    [customer?.address_detail, ward?.name, province?.name].filter(Boolean).join(", ") || null;

  const t = await getTranslations("reports");
  const tPatients = await getTranslations("patients");

  const buffer = await renderPrescriptionPdf({
    clinicName: clinic?.name ?? "",
    clinicAddress: clinic?.address ?? "",
    clinicPhone: clinic?.phone ?? "",
    patientName: customer ? `${customer.last_name} ${customer.first_name}` : "—",
    patientDob: customer?.dob ?? null,
    patientAge: computeAge(customer?.dob ?? null),
    patientGender: customer?.gender ? tPatients(`gender.${customer.gender}`) : null,
    patientAddress,
    date: c.checkup_date,
    diagnosis: c.diagnosis,
    doctorName: doctor ? `${doctor.last_name} ${doctor.first_name}` : null,
    medicines,
    labels: {
      prescription: t("prescription"),
      patient: t("patient"),
      date: t("date"),
      dob: tPatients("dob"),
      age: t("age"),
      gender: t("gender"),
      address: t("address"),
      diagnosis: t("diagnosis"),
      item: t("item"),
      qty: t("qty"),
      dosage: t("dosage"),
      doctor: t("doctor"),
      signature: t("signature"),
    },
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="prescription-${checkupId}.pdf"`,
    },
  });
}
