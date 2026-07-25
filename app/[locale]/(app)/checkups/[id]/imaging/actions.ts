"use server";

/**
 * Checkup imaging Server Actions. Clinical roles only (admin/receptionist/
 * doctor/nurse) — Storage RLS + the checkup_images RLS policies are the real
 * gate; getServerSession() here is defense-in-depth. Called directly from the
 * client components (not via useActionState — there's no form to re-render,
 * just a pending flag around the call), mirroring getWardsAction's shape.
 *
 * recordImageAction inserts metadata for an object the browser already
 * uploaded straight to Storage (RLS-gated there too). deleteImageAction
 * soft-deletes the metadata row and best-effort removes the storage object —
 * the gallery hides soft-deleted rows even if the object removal fails.
 */

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { getServerSession } from "@/lib/auth/get-server-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/db/roles";
import {
  CHECKUP_MEDIA_BUCKET,
  DeleteImageSchema,
  RecordImageSchema,
  isValidStoragePath,
  type ImageActionState,
} from "@/lib/imaging/image-schema";

const CLINICAL: AppRole[] = ["admin", "receptionist", "doctor", "nurse"];
const isClinical = (r: AppRole | null | undefined) => !!r && CLINICAL.includes(r);

export async function recordImageAction(checkupId: number, storagePath: string): Promise<ImageActionState> {
  const t = await getTranslations("imaging");

  const session = await getServerSession();
  if (!session || !isClinical(session.role)) {
    return { status: "error", message: t("errorForbidden") };
  }

  const parsed = RecordImageSchema.safeParse({ checkupId, storagePath });
  if (!parsed.success || !isValidStoragePath(parsed.data.checkupId, parsed.data.storagePath)) {
    return { status: "error", message: t("errorGeneric") };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("checkup_images").insert({
    checkup_id: parsed.data.checkupId,
    storage_path: parsed.data.storagePath,
    created_by: session.user.id,
  });
  if (error) return { status: "error", message: t("errorGeneric") };

  await supabase.rpc("log_audit", {
    p_action: "image.upload",
    p_entity: "checkup_images",
    p_entity_id: parsed.data.storagePath,
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/checkups/${parsed.data.checkupId}/imaging`);
  return { status: "success" };
}

export async function deleteImageAction(
  checkupId: number,
  imageId: number,
  storagePath: string,
): Promise<ImageActionState> {
  const t = await getTranslations("imaging");

  const session = await getServerSession();
  if (!session || !isClinical(session.role)) {
    return { status: "error", message: t("errorForbidden") };
  }

  const parsed = DeleteImageSchema.safeParse({ checkupId, imageId, storagePath });
  if (!parsed.success) {
    return { status: "error", message: t("errorGeneric") };
  }

  const supabase = await createSupabaseServerClient();

  const { error: updateError } = await supabase
    .from("checkup_images")
    .update({ deleted: true })
    .eq("id", parsed.data.imageId)
    .eq("checkup_id", parsed.data.checkupId);
  if (updateError) return { status: "error", message: t("errorGeneric") };

  // Best-effort object removal — metadata is already soft-deleted so the
  // gallery hides it regardless; a future retention sweep (Phase 7) reconciles
  // any orphaned object left behind by a failed removal here.
  await supabase.storage.from(CHECKUP_MEDIA_BUCKET).remove([parsed.data.storagePath]);

  await supabase.rpc("log_audit", {
    p_action: "image.delete",
    p_entity: "checkup_images",
    p_entity_id: String(parsed.data.imageId),
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/checkups/${parsed.data.checkupId}/imaging`);
  return { status: "success" };
}
