"use server";

/**
 * Queue Server Actions. Register a patient into today's queue (atomic queue
 * number via the register_checkup RPC) and call the next patient (status →
 * in_progress). Clinical roles only — RLS + register_checkup enforce it; the
 * getServerSession check is defense-in-depth.
 */

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { redirect } from "@/i18n/navigation";
import { getServerSession } from "@/lib/auth/get-server-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RegisterCheckupSchema, SetQueueCounterSchema } from "@/lib/checkups/checkup-schema";

/** @typedef {import('@/lib/db/roles').AppRole} AppRole */
/** @typedef {import('@/lib/checkups/checkup-schema').RegisterCheckupState} RegisterCheckupState */
/** @typedef {import('@/lib/checkups/checkup-schema').SetQueueCounterState} SetQueueCounterState */

/** @type {AppRole[]} */
const CLINICAL = ["admin", "receptionist", "doctor", "nurse"];
/** @param {AppRole | null | undefined} r */
const isClinical = (r) => !!r && CLINICAL.includes(r);

/** @type {AppRole[]} */
const COUNTER_MANAGERS = ["admin", "receptionist"];
/** @param {AppRole | null | undefined} r */
const canManageCounter = (r) => !!r && COUNTER_MANAGERS.includes(r);

/**
 * @param {RegisterCheckupState} _prev
 * @param {FormData} formData
 * @returns {Promise<RegisterCheckupState>}
 */
export async function registerCheckupAction(_prev, formData) {
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
      fieldErrors: /** @type {Record<string, string[]>} */ (parsed.error.flatten().fieldErrors),
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

/**
 * Manually sets today's queue counter for a shift (correcting a miscount,
 * resetting after a printer jam, etc). admin/receptionist only — RLS +
 * set_queue_counter's role check enforce it; this is defense-in-depth.
 */
/**
 * @param {SetQueueCounterState} _prev
 * @param {FormData} formData
 * @returns {Promise<SetQueueCounterState>}
 */
export async function setQueueCounterAction(_prev, formData) {
  const t = await getTranslations("queue");

  const session = await getServerSession();
  if (!canManageCounter(session?.role)) {
    return { status: "error", formError: t("errorForbidden") };
  }

  const parsed = SetQueueCounterSchema.safeParse({
    shiftId: formData.get("shiftId"),
    value: formData.get("value"),
  });
  if (!parsed.success) {
    return { status: "error", formError: t("errorGeneric") };
  }

  const { shiftId, value } = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("set_queue_counter", {
    p_shift_id: shiftId,
    p_value: value,
  });
  if (error) {
    return { status: "error", formError: t("errorGeneric") };
  }

  await supabase.rpc("log_audit", {
    p_action: "queue.set_counter",
    p_entity: "daily_queue_counters",
    p_entity_id: String(shiftId),
    p_details: { value },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/queue`);
  return { status: "success" };
}

/**
 * One-key "call next patient": picks the lowest-queue_number waiting checkup
 * for the given shift (call_next_patient RPC, advisory-locked server-side)
 * and marks it in_progress. On success, redirects straight to the checkup
 * screen so the doctor never has to find the row in the list themselves.
 */
/**
 * @param {FormData} formData
 * @returns {Promise<void>}
 */
export async function callNextPatientAction(formData) {
  const session = await getServerSession();
  if (!isClinical(session?.role)) return;

  const shiftId = Number(formData.get("shiftId"));
  if (!Number.isFinite(shiftId)) return;

  const supabase = await createSupabaseServerClient();
  const { data: nextId, error } = await supabase.rpc("call_next_patient", { p_shift_id: shiftId });
  if (error) return;

  await supabase.rpc("log_audit", {
    p_action: "checkup.call_next",
    p_entity: "checkups",
    ...(nextId != null ? { p_entity_id: String(nextId) } : {}),
    p_details: { shiftId, found: nextId != null },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/queue`);

  if (nextId != null) {
    return redirect({ href: `/${locale}/checkups/${nextId}`, locale });
  }
}

/**
 * @param {FormData} formData
 * @returns {Promise<void>}
 */
export async function callPatientAction(formData) {
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
