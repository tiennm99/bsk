"use server";

/**
 * Patient (customer) Server Actions. Clinical roles only (admin, receptionist,
 * doctor, nurse) — enforced by RLS on bsk.customers and re-checked here for a
 * friendly error. Writes run through the user client (RLS is the gate),
 * audit-logged, then redirect to the list. Soft-delete only.
 */

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { redirect } from "@/i18n/navigation";
import { getServerSession } from "@/lib/auth/get-server-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/db/roles";
import {
  CustomerSchema,
  type CustomerFormState,
  type CustomerInput,
} from "@/lib/customers/customer-schema";

const CLINICAL_ROLES: AppRole[] = ["admin", "receptionist", "doctor", "nurse"];
const isClinical = (role: AppRole | null | undefined) => !!role && CLINICAL_ROLES.includes(role);
const nullIfBlank = (s: string) => (s.trim().length ? s.trim() : null);

function readForm(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? "");
  return {
    lastName: get("lastName"),
    firstName: get("firstName"),
    dob: get("dob"),
    gender: get("gender"),
    phone: get("phone"),
    cccd: get("cccd"),
    provinceCode: get("provinceCode"),
    wardCode: get("wardCode"),
    addressDetail: get("addressDetail"),
  };
}

function toRow(d: CustomerInput) {
  return {
    first_name: d.firstName,
    last_name: d.lastName,
    dob: nullIfBlank(d.dob),
    gender: nullIfBlank(d.gender),
    phone: nullIfBlank(d.phone),
    cccd: nullIfBlank(d.cccd),
    province_code: nullIfBlank(d.provinceCode),
    ward_code: nullIfBlank(d.wardCode),
    address_detail: nullIfBlank(d.addressDetail),
  };
}

// ── Create (useActionState-compatible; redirects to the list on success) ─────
export async function createCustomerAction(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const t = await getTranslations("patients");

  const session = await getServerSession();
  if (!isClinical(session?.role)) {
    return { status: "error", fieldErrors: {}, formError: t("errorForbidden") };
  }

  const parsed = CustomerSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      formError: null,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customers")
    .insert(toRow(parsed.data))
    .select("id")
    .single();
  if (error || !data) {
    return { status: "error", fieldErrors: {}, formError: t("errorGeneric") };
  }

  await supabase.rpc("log_audit", {
    p_action: "customer.create",
    p_entity: "customers",
    p_entity_id: String(data.id),
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/patients`);
  // redirect() throws NEXT_REDIRECT; the `return` marks this branch never-returning.
  return redirect({ href: `/${locale}/patients`, locale });
}

// ── Update ───────────────────────────────────────────────────────────────────
export async function updateCustomerAction(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const t = await getTranslations("patients");

  const session = await getServerSession();
  if (!isClinical(session?.role)) {
    return { status: "error", fieldErrors: {}, formError: t("errorForbidden") };
  }

  const id = Number(formData.get("id"));
  const parsed = CustomerSchema.safeParse(readForm(formData));
  if (!Number.isFinite(id) || !parsed.success) {
    return {
      status: "error",
      fieldErrors: parsed.success
        ? {}
        : (parsed.error.flatten().fieldErrors as Record<string, string[]>),
      formError: parsed.success ? t("errorGeneric") : null,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("customers").update(toRow(parsed.data)).eq("id", id);
  if (error) {
    return { status: "error", fieldErrors: {}, formError: t("errorGeneric") };
  }

  await supabase.rpc("log_audit", {
    p_action: "customer.update",
    p_entity: "customers",
    p_entity_id: String(id),
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/patients`);
  return redirect({ href: `/${locale}/patients`, locale });
}

// ── Soft-delete (deactivate) ─────────────────────────────────────────────────
export async function deactivateCustomerAction(formData: FormData): Promise<void> {
  const session = await getServerSession();
  if (!isClinical(session?.role)) return;

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("customers").update({ deleted: true }).eq("id", id);
  if (!error) {
    await supabase.rpc("log_audit", {
      p_action: "customer.deactivate",
      p_entity: "customers",
      p_entity_id: String(id),
    });
    const locale = await getLocale();
    revalidatePath(`/${locale}/patients`);
  }
}

// ── Wards for a province (cascading address dropdown) ─────────────────────────
export async function getWardsAction(
  provinceCode: string,
): Promise<{ code: string; name: string }[]> {
  const session = await getServerSession();
  if (!session?.role || !provinceCode) return [];

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("wards")
    .select("code, name")
    .eq("province_code", provinceCode)
    .order("name", { ascending: true });
  return data ?? [];
}
