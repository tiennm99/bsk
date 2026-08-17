"use server";

/** Service catalog Server Actions (admin only). RLS-gated, audit-logged. */

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { getServerSession } from "@/lib/auth/get-server-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ServiceSchema } from "@/lib/catalog/service-schema";

/** @typedef {import('@/lib/catalog/service-schema').ServiceFormState} ServiceFormState */

async function revalidateServices() {
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/services`);
}

/**
 * @param {ServiceFormState} _prev
 * @param {FormData} formData
 * @returns {Promise<ServiceFormState>}
 */
export async function createServiceAction(_prev, formData) {
  const t = await getTranslations("admin.services");
  const session = await getServerSession();
  if (session?.role !== "admin")
    return { status: "error", fieldErrors: {}, formError: t("errorForbidden") };

  const parsed = ServiceSchema.safeParse({
    name: formData.get("name"),
    price: formData.get("price"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: /** @type {Record<string, string[]>} */ (parsed.error.flatten().fieldErrors),
      formError: null,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("services")
    .insert({ name: parsed.data.name, price: parsed.data.price })
    .select("id")
    .single();
  if (error || !data) return { status: "error", fieldErrors: {}, formError: t("errorGeneric") };

  await supabase.rpc("log_audit", {
    p_action: "service.create",
    p_entity: "services",
    p_entity_id: String(data.id),
  });
  await revalidateServices();
  return { status: "success", serviceName: parsed.data.name };
}

/**
 * @param {FormData} formData
 * @returns {Promise<void>}
 */
export async function updateServiceAction(formData) {
  const session = await getServerSession();
  if (session?.role !== "admin") return;

  const id = Number(formData.get("id"));
  const parsed = ServiceSchema.safeParse({
    name: formData.get("name"),
    price: formData.get("price"),
  });
  if (!Number.isFinite(id) || !parsed.success) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("services")
    .update({ name: parsed.data.name, price: parsed.data.price })
    .eq("id", id);
  if (!error) {
    await supabase.rpc("log_audit", {
      p_action: "service.update",
      p_entity: "services",
      p_entity_id: String(id),
    });
    await revalidateServices();
  }
}

/**
 * @param {FormData} formData
 * @returns {Promise<void>}
 */
export async function deactivateServiceAction(formData) {
  const session = await getServerSession();
  if (session?.role !== "admin") return;

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("services").update({ deleted: true }).eq("id", id);
  if (!error) {
    await supabase.rpc("log_audit", {
      p_action: "service.deactivate",
      p_entity: "services",
      p_entity_id: String(id),
    });
    await revalidateServices();
  }
}
