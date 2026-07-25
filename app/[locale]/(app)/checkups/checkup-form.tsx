"use client";

/**
 * Checkup form — one keyboard-tabbable screen (vitals → diagnosis → conclusion
 * → recheck → status). Native <form action> posting to saveCheckupAction
 * (redirects to the queue on success).
 */

import { useActionState, useEffect, useRef, useState, type RefObject } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkupStatuses, type CheckupSaveState } from "@/lib/checkups/checkup-schema";
import { saveCheckupAction } from "./actions";

const CONTROL =
  "border-input bg-background text-foreground focus-visible:ring-ring w-full rounded-md border px-3 text-sm focus:outline-none focus-visible:ring-2 disabled:opacity-50";

export type CheckupDefaults = {
  id: number;
  heartBeat: string;
  bloodPressure: string;
  temperature: string;
  weight: string;
  height: string;
  symptoms: string;
  diagnosis: string;
  conclusion: string;
  notes: string;
  recheckDate: string;
  status: string;
};

export type CheckupTemplateOption = { id: number; name: string; labels: string[] };
type TemplateValue = { label: string; value: string };

export function CheckupForm({
  defaults,
  templates,
  initialTemplateId,
  initialTemplateValues,
  diagnosisSuggestions = [],
}: {
  defaults: CheckupDefaults;
  templates: CheckupTemplateOption[];
  initialTemplateId: number | null;
  initialTemplateValues: TemplateValue[];
  diagnosisSuggestions?: string[];
}) {
  const t = useTranslations("checkups");
  const [state, dispatch, isPending] = useActionState<CheckupSaveState, FormData>(saveCheckupAction, {
    status: "idle",
  });
  const formError = state.status === "error" ? state.formError : null;

  // Unsaved-changes guard: any edit flips `dirty`; saving clears it so a
  // successful (or in-flight) submit never triggers the beforeunload prompt.
  // beforeunload doesn't fire for client-side route changes, so we also show
  // an in-app marker near the Save button.
  const [dirty, setDirty] = useState(false);
  const diagnosisRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!dirty || isPending) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, isPending]);

  // Diagnosis quick-pick: a <textarea> cannot use a native <datalist>, so
  // recent diagnoses are offered via a small select above the field that
  // appends the chosen text into the (uncontrolled) textarea via ref — the
  // least disruptive option since it doesn't require converting the field to
  // controlled state.
  function applyDiagnosisSuggestion(text: string) {
    if (!text) return;
    const el = diagnosisRef.current;
    if (!el) return;
    const current = el.value.trim();
    el.value = current ? `${current}; ${text}` : text;
    setDirty(true);
  }

  // Template picker — plain state, no effects. Selecting a template swaps the
  // rendered field labels below; typed values are kept per-label so switching
  // back and forth doesn't lose what was already entered.
  const [templateId, setTemplateId] = useState(initialTemplateId != null ? String(initialTemplateId) : "");
  const [templateFieldValues, setTemplateFieldValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialTemplateValues.map((v) => [v.label, v.value])),
  );

  const selectedTemplate = templates.find((tpl) => String(tpl.id) === templateId) ?? null;
  const templateValuesJson = JSON.stringify(
    (selectedTemplate?.labels ?? []).map((label) => ({
      label,
      value: templateFieldValues[label] ?? "",
    })),
  );

  const textField = (name: keyof CheckupDefaults, label: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={defaults[name]} disabled={isPending} />
    </div>
  );

  const area = (
    name: keyof CheckupDefaults,
    label: string,
    ref?: RefObject<HTMLTextAreaElement | null>,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <textarea
        id={name}
        name={name}
        ref={ref}
        rows={3}
        defaultValue={defaults[name]}
        disabled={isPending}
        className={`${CONTROL} py-2`}
      />
    </div>
  );

  return (
    <form
      action={dispatch}
      noValidate
      className="space-y-5"
      onChange={() => setDirty(true)}
      onSubmit={() => setDirty(false)}
    >
      <input type="hidden" name="id" value={defaults.id} />

      <fieldset className="border-border grid gap-4 rounded-md border p-4 sm:grid-cols-3">
        <legend className="text-muted-foreground px-1 text-xs">{t("vitals")}</legend>
        {textField("bloodPressure", t("bloodPressure"))}
        {textField("heartBeat", t("heartBeat"))}
        {textField("temperature", t("temperature"))}
        {textField("weight", t("weight"))}
        {textField("height", t("height"))}
      </fieldset>

      {area("symptoms", t("symptoms"))}

      {templates.length > 0 && (
        <fieldset className="border-border space-y-3 rounded-md border p-4">
          <legend className="text-muted-foreground px-1 text-xs">{t("template")}</legend>
          <input type="hidden" name="templateId" value={templateId} readOnly />
          <input type="hidden" name="templateValues" value={templateValuesJson} readOnly />

          <div className="space-y-1.5">
            <Label htmlFor="templateSelect">{t("template")}</Label>
            <select
              id="templateSelect"
              value={templateId}
              disabled={isPending}
              onChange={(e) => setTemplateId(e.target.value)}
              className={`${CONTROL} h-10`}
            >
              <option value="">{t("templateNone")}</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
          </div>

          {selectedTemplate && selectedTemplate.labels.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <p className="text-muted-foreground text-xs sm:col-span-2">{t("templateFields")}</p>
              {selectedTemplate.labels.map((label) => (
                <div key={label} className="space-y-1.5">
                  <Label htmlFor={`template-field-${label}`}>{label}</Label>
                  <Input
                    id={`template-field-${label}`}
                    value={templateFieldValues[label] ?? ""}
                    disabled={isPending}
                    onChange={(e) =>
                      setTemplateFieldValues((prev) => ({ ...prev, [label]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </fieldset>
      )}

      {diagnosisSuggestions.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="diagnosisQuickPick">{t("quickDiagnosis")}</Label>
          <select
            id="diagnosisQuickPick"
            value=""
            disabled={isPending}
            onChange={(e) => applyDiagnosisSuggestion(e.target.value)}
            className={`${CONTROL} h-10`}
          >
            <option value="">—</option>
            {diagnosisSuggestions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      )}
      {area("diagnosis", t("diagnosis"), diagnosisRef)}
      {area("conclusion", t("conclusion"))}
      {area("notes", t("notes"))}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="recheckDate">{t("recheckDate")}</Label>
          <Input id="recheckDate" name="recheckDate" type="date" defaultValue={defaults.recheckDate} disabled={isPending} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">{t("statusLabel")}</Label>
          <select id="status" name="status" defaultValue={defaults.status} disabled={isPending} className={`${CONTROL} h-10`}>
            {checkupStatuses.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {formError && (
        <p className="text-destructive text-sm" role="alert">
          {formError}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending ? t("saving") : t("save")}
        </Button>
        {dirty && !isPending && (
          <span className="text-muted-foreground text-xs">{t("unsavedChanges")}</span>
        )}
      </div>
    </form>
  );
}
