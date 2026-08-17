"use server";

/** Medicine catalog Server Actions (admin only). RLS-gated, audit-logged. */

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { redirect } from "@/i18n/navigation";
import { getServerSession } from "@/lib/auth/get-server-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  MedicineSchema,
  type MedicineFormState,
  type MedicineInput,
} from "@/lib/catalog/medicine-schema";

function readForm(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? "");
  return {
    name: get("name"),
    unit: get("unit"),
    salePrice: get("salePrice"),
    costPrice: get("costPrice"),
    company: get("company"),
    route: get("route"),
  };
}

function toRow(d: MedicineInput) {
  const cost = d.costPrice.trim() ? Number(d.costPrice) : null;
  return {
    name: d.name,
    unit: d.unit.trim() || null,
    sale_price: d.salePrice,
    cost_price: cost != null && Number.isFinite(cost) ? Math.trunc(cost) : null,
    company: d.company.trim() || null,
    route: d.route.trim() || null,
  };
}

async function finish(): Promise<never> {
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/medicines`);
  return redirect({ href: `/${locale}/admin/medicines`, locale });
}

export async function createMedicineAction(
  _prev: MedicineFormState,
  formData: FormData,
): Promise<MedicineFormState> {
  const t = await getTranslations("admin.medicines");
  const session = await getServerSession();
  if (session?.role !== "admin")
    return { status: "error", fieldErrors: {}, formError: t("errorForbidden") };

  const parsed = MedicineSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      formError: null,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("medicines")
    .insert(toRow(parsed.data))
    .select("id")
    .single();
  if (error || !data) return { status: "error", fieldErrors: {}, formError: t("errorGeneric") };

  await supabase.rpc("log_audit", {
    p_action: "medicine.create",
    p_entity: "medicines",
    p_entity_id: String(data.id),
  });
  return finish();
}

export async function updateMedicineAction(
  _prev: MedicineFormState,
  formData: FormData,
): Promise<MedicineFormState> {
  const t = await getTranslations("admin.medicines");
  const session = await getServerSession();
  if (session?.role !== "admin")
    return { status: "error", fieldErrors: {}, formError: t("errorForbidden") };

  const id = Number(formData.get("id"));
  const parsed = MedicineSchema.safeParse(readForm(formData));
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
  const { error } = await supabase.from("medicines").update(toRow(parsed.data)).eq("id", id);
  if (error) return { status: "error", fieldErrors: {}, formError: t("errorGeneric") };

  await supabase.rpc("log_audit", {
    p_action: "medicine.update",
    p_entity: "medicines",
    p_entity_id: String(id),
  });
  return finish();
}

export async function deactivateMedicineAction(formData: FormData): Promise<void> {
  const session = await getServerSession();
  if (session?.role !== "admin") return;

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("medicines").update({ deleted: true }).eq("id", id);
  if (!error) {
    await supabase.rpc("log_audit", {
      p_action: "medicine.deactivate",
      p_entity: "medicines",
      p_entity_id: String(id),
    });
    const locale = await getLocale();
    revalidatePath(`/${locale}/admin/medicines`);
  }
}
