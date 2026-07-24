"use server";

/**
 * Server Actions for doctor management (admin only).
 *
 * Writes run through the caller's user client so the RLS admin policy on
 * bsk.doctors is the enforcement point; the getServerSession role check is
 * defense-in-depth (and lets us return a friendly error instead of a raw RLS
 * failure). Every mutation is audit-logged via bsk.log_audit and revalidates
 * the list. Soft-delete only — rows are never hard-deleted.
 */

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { getServerSession } from "@/lib/auth/get-server-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DoctorSchema, type DoctorFormState } from "@/lib/doctors/doctor-schema";

async function revalidateDoctors() {
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/doctors`);
}

// ── Create (useActionState-compatible) ───────────────────────────────────────
export async function createDoctorAction(
  _prev: DoctorFormState,
  formData: FormData,
): Promise<DoctorFormState> {
  const t = await getTranslations("admin.doctors");

  const session = await getServerSession();
  if (session?.role !== "admin") {
    return { status: "error", fieldErrors: {}, formError: t("errorForbidden") };
  }

  const parsed = DoctorSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      formError: null,
    };
  }

  const { firstName, lastName } = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("doctors")
    .insert({ first_name: firstName, last_name: lastName })
    .select("id")
    .single();

  if (error || !data) {
    return { status: "error", fieldErrors: {}, formError: t("errorGeneric") };
  }

  await supabase.rpc("log_audit", {
    p_action: "doctor.create",
    p_entity: "doctors",
    p_entity_id: String(data.id),
  });

  await revalidateDoctors();
  return { status: "success", doctorName: `${lastName} ${firstName}`.trim() };
}

// ── Update ───────────────────────────────────────────────────────────────────
export async function updateDoctorAction(formData: FormData): Promise<void> {
  const session = await getServerSession();
  if (session?.role !== "admin") return;

  const id = Number(formData.get("id"));
  const parsed = DoctorSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
  });
  if (!Number.isFinite(id) || !parsed.success) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("doctors")
    .update({ first_name: parsed.data.firstName, last_name: parsed.data.lastName })
    .eq("id", id);

  if (!error) {
    await supabase.rpc("log_audit", {
      p_action: "doctor.update",
      p_entity: "doctors",
      p_entity_id: String(id),
    });
    await revalidateDoctors();
  }
}

// ── Soft-delete (deactivate) ─────────────────────────────────────────────────
export async function deactivateDoctorAction(formData: FormData): Promise<void> {
  const session = await getServerSession();
  if (session?.role !== "admin") return;

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("doctors").update({ deleted: true }).eq("id", id);

  if (!error) {
    await supabase.rpc("log_audit", {
      p_action: "doctor.deactivate",
      p_entity: "doctors",
      p_entity_id: String(id),
    });
    await revalidateDoctors();
  }
}
