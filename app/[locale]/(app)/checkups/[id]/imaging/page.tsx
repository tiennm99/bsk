// WARNING: Do NOT add `'use cache'` — reads cookies() via the server client.

/**
 * Imaging gallery for a checkup. Loads the checkup + patient name and the
 * not-deleted checkup_images rows, generates a 1h signed URL per image
 * server-side, then hands everything to the client capture form + gallery.
 * Gated by the checkups layout (clinical roles).
 */

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CHECKUP_MEDIA_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/lib/imaging/image-schema";
import { ImageCapture } from "./image-capture";
import { ImageGallery } from "./image-gallery";
import { CheckupBarcode } from "./checkup-barcode";

export default async function ImagingPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("imaging");
  const checkupId = Number(id);
  if (!Number.isFinite(checkupId)) notFound();

  const supabase = await createSupabaseServerClient();

  const { data: checkup } = await supabase
    .from("checkups")
    .select("id, customer_id, queue_number")
    .eq("id", checkupId)
    .eq("deleted", false)
    .maybeSingle();
  if (!checkup) notFound();

  const [{ data: customer }, { data: images }] = await Promise.all([
    supabase.from("customers").select("last_name, first_name").eq("id", checkup.customer_id).maybeSingle(),
    supabase
      .from("checkup_images")
      .select("id, storage_path, created_at")
      .eq("checkup_id", checkupId)
      .eq("deleted", false)
      .order("created_at", { ascending: false }),
  ]);

  const patientName = customer ? `${customer.last_name} ${customer.first_name}` : "—";

  const signedImages = await Promise.all(
    (images ?? []).map(async (img) => {
      const { data: signed } = await supabase.storage
        .from(CHECKUP_MEDIA_BUCKET)
        .createSignedUrl(img.storage_path, SIGNED_URL_TTL_SECONDS);
      return {
        id: img.id,
        storagePath: img.storage_path,
        url: signed?.signedUrl ?? null,
      };
    }),
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          {checkup.queue_number != null && (
            <span className="text-foreground text-2xl font-bold tabular-nums">#{checkup.queue_number}</span>
          )}
          <h1 className="text-foreground text-xl font-semibold">{patientName}</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">{t("title")}</p>
      </div>

      <div className="space-y-8">
        <CheckupBarcode checkupId={checkup.id} />
        <ImageCapture checkupId={checkup.id} />
        <ImageGallery checkupId={checkup.id} images={signedImages} />
      </div>
    </div>
  );
}
