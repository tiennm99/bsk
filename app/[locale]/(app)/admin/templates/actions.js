"use server";

/**
 * Checkup-template Server Actions (admin only). Same pattern as doctors/patients:
 * RLS admin policy is the gate, getServerSession is defense-in-depth, mutations
 * are audit-logged and redirect to the list on success. Soft-delete only.
 */

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { redirect } from "@/i18n/navigation";
import { getServerSession } from "@/lib/auth/get-server-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  TemplateSchema,
  fieldsTextToJson,
  type TemplateFormState,
  type TemplateInput,
} from "@/lib/templates/template-schema";

function readForm(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? "");
  return {
    name: get("name"),
    title: get("title"),
    gender: get("gender"),
    photoNum: get("photoNum"),
    fieldsText: get("fieldsText"),
  };
}

function toRow(d: TemplateInput) {
  return {
    name: d.name,
    title: d.title.trim().length ? d.title.trim() : null,
    gender: d.gender,
    photo_num: d.photoNum,
    fields: fieldsTextToJson(d.fieldsText),
  };
}

async function finish(): Promise<never> {
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/templates`);
  return redirect({ href: `/${locale}/admin/templates`, locale });
}

export async function createTemplateAction(
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const t = await getTranslations("admin.templates");

  const session = await getServerSession();
  if (session?.role !== "admin") {
    return { status: "error", fieldErrors: {}, formError: t("errorForbidden") };
  }

  const parsed = TemplateSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      formError: null,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("checkup_templates")
    .insert(toRow(parsed.data))
    .select("id")
    .single();
  if (error || !data) {
    return { status: "error", fieldErrors: {}, formError: t("errorGeneric") };
  }

  await supabase.rpc("log_audit", {
    p_action: "template.create",
    p_entity: "checkup_templates",
    p_entity_id: String(data.id),
  });
  return finish();
}

export async function updateTemplateAction(
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const t = await getTranslations("admin.templates");

  const session = await getServerSession();
  if (session?.role !== "admin") {
    return { status: "error", fieldErrors: {}, formError: t("errorForbidden") };
  }

  const id = Number(formData.get("id"));
  const parsed = TemplateSchema.safeParse(readForm(formData));
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
  const { error } = await supabase
    .from("checkup_templates")
    .update(toRow(parsed.data))
    .eq("id", id);
  if (error) {
    return { status: "error", fieldErrors: {}, formError: t("errorGeneric") };
  }

  await supabase.rpc("log_audit", {
    p_action: "template.update",
    p_entity: "checkup_templates",
    p_entity_id: String(id),
  });
  return finish();
}

export async function deactivateTemplateAction(formData: FormData): Promise<void> {
  const session = await getServerSession();
  if (session?.role !== "admin") return;

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("checkup_templates").update({ deleted: true }).eq("id", id);
  if (!error) {
    await supabase.rpc("log_audit", {
      p_action: "template.deactivate",
      p_entity: "checkup_templates",
      p_entity_id: String(id),
    });
    const locale = await getLocale();
    revalidatePath(`/${locale}/admin/templates`);
  }
}
