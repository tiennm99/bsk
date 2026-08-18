// WARNING: Do NOT add `'use cache'` — the child form is a client component.

import { getTranslations } from "next-intl/server";
import { TemplateForm } from "../template-form";
import { createTemplateAction } from "../actions";

/**
 * @param {{ params: Promise<{ locale: string }> }} props
 * @returns {Promise<import("react").JSX.Element>}
 */
export default async function NewTemplatePage({ params }) {
  await params;
  const t = await getTranslations("admin.templates");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-foreground mb-6 text-xl font-semibold">{t("newTitle")}</h1>
      <TemplateForm
        mode="create"
        action={createTemplateAction}
        defaults={{ name: "", title: "", gender: "any", photoNum: 0, fieldsText: "" }}
      />
    </div>
  );
}
