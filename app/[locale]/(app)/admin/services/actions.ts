"use server";

/** Service catalog Server Actions (admin only). RLS-gated, audit-logged. */

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { getServerSession } from "@/lib/auth/get-server-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ServiceSchema, type ServiceFormState } from "@/lib/catalog/service-schema";

async function revalidateServices() {
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/services`);
}

export async function createServiceAction(
  _prev: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const t = await getTranslations("admin.services");
  const session = await getServerSession();
  if (session?.role !== "admin") return { status: "error", fieldErrors: {}, formError: t("errorForbidden") };

  const parsed = ServiceSchema.safeParse({ name: formData.get("name"), price: formData.get("price") });
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>, formError: null };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("services")
    .insert({ name: parsed.data.name, price: parsed.data.price })
    .select("id")
    .single();
  if (error || !data) return { status: "error", fieldErrors: {}, formError: t("errorGeneric") };

  await supabase.rpc("log_audit", { p_action: "service.create", p_entity: "services", p_entity_id: String(data.id) });
  await revalidateServices();
  return { status: "success", serviceName: parsed.data.name };
}

export async function updateServiceAction(formData: FormData): Promise<void> {
  const session = await getServerSession();
  if (session?.role !== "admin") return;

  const id = Number(formData.get("id"));
  const parsed = ServiceSchema.safeParse({ name: formData.get("name"), price: formData.get("price") });
  if (!Number.isFinite(id) || !parsed.success) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("services")
    .update({ name: parsed.data.name, price: parsed.data.price })
    .eq("id", id);
  if (!error) {
    await supabase.rpc("log_audit", { p_action: "service.update", p_entity: "services", p_entity_id: String(id) });
    await revalidateServices();
  }
}

export async function deactivateServiceAction(formData: FormData): Promise<void> {
  const session = await getServerSession();
  if (session?.role !== "admin") return;

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("services").update({ deleted: true }).eq("id", id);
  if (!error) {
    await supabase.rpc("log_audit", { p_action: "service.deactivate", p_entity: "services", p_entity_id: String(id) });
    await revalidateServices();
  }
}
