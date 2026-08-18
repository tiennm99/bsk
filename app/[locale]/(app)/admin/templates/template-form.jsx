"use client";

/**
 * Checkup-template form — shared create/edit. Native <form action> posting to
 * the given Server Action (both useActionState-shaped; success redirects).
 * Field layout is edited as one label per line (serialized to jsonb server-side).
 */

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { templateGenders } from "@/lib/templates/template-schema";

/** @typedef {import('@/lib/templates/template-schema').TemplateFormState} TemplateFormState */

/**
 * @typedef {Object} TemplateDefaults
 * @property {number} [id]
 * @property {string} name
 * @property {string} title
 * @property {string} gender
 * @property {number} photoNum
 * @property {string} fieldsText
 */

const CONTROL =
  "border-input bg-background text-foreground focus-visible:ring-ring w-full rounded-md border px-3 text-sm focus:outline-none focus-visible:ring-2 disabled:opacity-50";

/**
 * @param {{
 *   mode: "create" | "edit",
 *   action: (prev: TemplateFormState, formData: FormData) => Promise<TemplateFormState>,
 *   defaults: TemplateDefaults,
 * }} props
 */
export function TemplateForm({ mode, action, defaults }) {
  const t = useTranslations("admin.templates");
  const [state, dispatch, isPending] = useActionState(action, {
    status: "idle",
  });

  const fe = state.status === "error" ? state.fieldErrors : {};
  const formError = state.status === "error" ? state.formError : null;
  /** @param {string} f */
  const err = (f) =>
    fe[f]?.length ? (
      <p className="text-destructive text-sm" role="alert">
        {fe[f][0]}
      </p>
    ) : null;

  return (
    <form action={dispatch} noValidate className="space-y-4">
      {mode === "edit" && <input type="hidden" name="id" value={defaults.id} />}

      <div className="space-y-1.5">
        <Label htmlFor="name">{t("name")}</Label>
        <Input id="name" name="name" defaultValue={defaults.name} disabled={isPending} />
        {err("name")}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="title">{t("printTitle")}</Label>
        <Input id="title" name="title" defaultValue={defaults.title} disabled={isPending} />
        {err("title")}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="gender">{t("gender")}</Label>
          <select
            id="gender"
            name="gender"
            defaultValue={defaults.gender}
            disabled={isPending}
            className={`${CONTROL} h-10`}
          >
            {templateGenders.map((g) => (
              <option key={g} value={g}>
                {t(`genders.${g}`)}
              </option>
            ))}
          </select>
          {err("gender")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="photoNum">{t("photoNum")}</Label>
          <Input
            id="photoNum"
            name="photoNum"
            type="number"
            min={0}
            max={50}
            defaultValue={defaults.photoNum}
            disabled={isPending}
          />
          {err("photoNum")}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fieldsText">{t("fields")}</Label>
        <textarea
          id="fieldsText"
          name="fieldsText"
          rows={6}
          defaultValue={defaults.fieldsText}
          disabled={isPending}
          className={`${CONTROL} py-2`}
          placeholder={t("fieldsHint")}
        />
        <p className="text-muted-foreground text-xs">{t("fieldsHint")}</p>
        {err("fieldsText")}
      </div>

      {formError && (
        <p className="text-destructive text-sm" role="alert">
          {formError}
        </p>
      )}

      <Button type="submit" size="lg" disabled={isPending}>
        {isPending ? t("saving") : mode === "create" ? t("create") : t("save")}
      </Button>
    </form>
  );
}
