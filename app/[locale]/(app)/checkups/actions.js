"use server";

/**
 * Checkup save (doctor fills vitals + diagnosis + conclusion + recheck, and
 * sets status). Clinical roles only (RLS update policy is the gate). Redirects
 * back to the queue on success.
 */

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { redirect } from "@/i18n/navigation";
import { getServerSession } from "@/lib/auth/get-server-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CheckupSaveSchema, parseNum, parseTemplateValues } from "@/lib/checkups/checkup-schema";

/** @typedef {import('@/lib/db/roles').AppRole} AppRole */
/** @typedef {import('@/lib/checkups/checkup-schema').CheckupSaveState} CheckupSaveState */

/** @type {AppRole[]} */
const CLINICAL = ["admin", "receptionist", "doctor", "nurse"];
/** @param {AppRole | null | undefined} r */
const isClinical = (r) => !!r && CLINICAL.includes(r);
/** @param {string} s */
const nullIfBlank = (s) => (s.trim().length ? s.trim() : null);

/**
 * @param {CheckupSaveState} _prev
 * @param {FormData} formData
 * @returns {Promise<CheckupSaveState>}
 */
export async function saveCheckupAction(_prev, formData) {
  const t = await getTranslations("checkups");

  const session = await getServerSession();
  if (!isClinical(session?.role)) {
    return { status: "error", fieldErrors: {}, formError: t("errorForbidden") };
  }

  const id = Number(formData.get("id"));
  /** @param {string} k */
  const get = (k) => String(formData.get(k) ?? "");
  const parsed = CheckupSaveSchema.safeParse({
    heartBeat: get("heartBeat"),
    bloodPressure: get("bloodPressure"),
    temperature: get("temperature"),
    weight: get("weight"),
    height: get("height"),
    symptoms: get("symptoms"),
    diagnosis: get("diagnosis"),
    conclusion: get("conclusion"),
    notes: get("notes"),
    recheckDate: get("recheckDate"),
    status: get("status"),
  });

  if (!Number.isFinite(id) || !parsed.success) {
    return {
      status: "error",
      fieldErrors: parsed.success
        ? {}
        : /** @type {Record<string, string[]>} */ (parsed.error.flatten().fieldErrors),
      formError: parsed.success ? t("errorGeneric") : null,
    };
  }

  const d = parsed.data;

  const templateIdRaw = get("templateId").trim();
  const templateId =
    templateIdRaw && Number.isFinite(Number(templateIdRaw)) ? Number(templateIdRaw) : null;
  const templateValues = parseTemplateValues(get("templateValues"));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("checkups")
    .update({
      heart_beat: nullIfBlank(d.heartBeat),
      blood_pressure: nullIfBlank(d.bloodPressure),
      temperature: parseNum(d.temperature),
      weight: parseNum(d.weight),
      height: parseNum(d.height),
      symptoms: nullIfBlank(d.symptoms),
      diagnosis: nullIfBlank(d.diagnosis),
      conclusion: nullIfBlank(d.conclusion),
      notes: nullIfBlank(d.notes),
      recheck_date: nullIfBlank(d.recheckDate),
      status: d.status,
      template_id: templateId,
      template_values: templateValues,
    })
    .eq("id", id);

  if (error) {
    return { status: "error", fieldErrors: {}, formError: t("errorGeneric") };
  }

  await supabase.rpc("log_audit", {
    p_action: "checkup.save",
    p_entity: "checkups",
    p_entity_id: String(id),
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/queue`);
  return redirect({ href: `/${locale}/queue`, locale });
}

// ── Soft-delete ───────────────────────────────────────────────────────────────
/**
 * @param {FormData} formData
 * @returns {Promise<void>}
 */
export async function deleteCheckupAction(formData) {
  const session = await getServerSession();
  if (!isClinical(session?.role)) return;

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("checkups").update({ deleted: true }).eq("id", id);
  if (error) return;

  await supabase.rpc("log_audit", {
    p_action: "checkup.delete",
    p_entity: "checkups",
    p_entity_id: String(id),
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/queue`);
  return redirect({ href: `/${locale}/queue`, locale });
}
