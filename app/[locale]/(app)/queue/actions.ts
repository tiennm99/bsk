"use server";

/**
 * Queue Server Actions. Register a patient into today's queue (atomic queue
 * number via the register_checkup RPC) and call the next patient (status →
 * in_progress). Clinical roles only — RLS + register_checkup enforce it; the
 * getServerSession check is defense-in-depth.
 */

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { getServerSession } from "@/lib/auth/get-server-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/db/roles";
import { RegisterCheckupSchema, type RegisterCheckupState } from "@/lib/checkups/checkup-schema";

const CLINICAL: AppRole[] = ["admin", "receptionist", "doctor", "nurse"];
const isClinical = (r: AppRole | null | undefined) => !!r && CLINICAL.includes(r);

export async function registerCheckupAction(
  _prev: RegisterCheckupState,
  formData: FormData,
): Promise<RegisterCheckupState> {
  const t = await getTranslations("queue");

  const session = await getServerSession();
  if (!isClinical(session?.role)) {
    return { status: "error", fieldErrors: {}, formError: t("errorForbidden") };
  }

  const parsed = RegisterCheckupSchema.safeParse({
    customerId: formData.get("customerId"),
    shiftId: formData.get("shiftId"),
    doctorId: formData.get("doctorId"),
    checkupType: formData.get("checkupType"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      formError: null,
    };
  }

  const { customerId, shiftId, doctorId, checkupType } = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { data: newId, error } = await supabase.rpc("register_checkup", {
    p_customer_id: customerId,
    p_shift_id: shiftId,
    p_doctor_id: doctorId ? Number(doctorId) : undefined,
    p_checkup_type: checkupType || undefined,
  });
  if (error || newId == null) {
    return { status: "error", fieldErrors: {}, formError: t("errorGeneric") };
  }

  await supabase.rpc("log_audit", {
    p_action: "checkup.register",
    p_entity: "checkups",
    p_entity_id: String(newId),
  });

  const { data: row } = await supabase
    .from("checkups")
    .select("queue_number")
    .eq("id", newId)
    .maybeSingle();

  const locale = await getLocale();
  revalidatePath(`/${locale}/queue`);
  return { status: "success", queueNumber: row?.queue_number ?? null };
}

export async function callPatientAction(formData: FormData): Promise<void> {
  const session = await getServerSession();
  if (!isClinical(session?.role)) return;

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("checkups").update({ status: "in_progress" }).eq("id", id);
  if (!error) {
    await supabase.rpc("log_audit", {
      p_action: "checkup.call",
      p_entity: "checkups",
      p_entity_id: String(id),
    });
    const locale = await getLocale();
    revalidatePath(`/${locale}/queue`);
  }
}
