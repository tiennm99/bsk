// WARNING: Do NOT add `'use cache'` — reads cookies() via the server client.

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fieldsJsonToText } from "@/lib/templates/template-schema";
import { TemplateForm } from "../../template-form";
import { updateTemplateAction } from "../../actions";

/**
 * @param {{ params: Promise<{ locale: string, id: string }> }} props
 * @returns {Promise<import("react").JSX.Element>}
 */
export default async function EditTemplatePage({ params }) {
  const { id } = await params;
  const t = await getTranslations("admin.templates");
  const templateId = Number(id);
  if (!Number.isFinite(templateId)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: tpl } = await supabase
    .from("checkup_templates")
    .select("id, name, title, gender, photo_num, fields")
    .eq("id", templateId)
    .eq("deleted", false)
    .maybeSingle();

  if (!tpl) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-foreground mb-6 text-xl font-semibold">
        {t("editTitle", { name: tpl.name })}
      </h1>
      <TemplateForm
        mode="edit"
        action={updateTemplateAction}
        defaults={{
          id: tpl.id,
          name: tpl.name,
          title: tpl.title ?? "",
          gender: tpl.gender,
          photoNum: tpl.photo_num,
          fieldsText: fieldsJsonToText(tpl.fields),
        }}
      />
    </div>
  );
}
