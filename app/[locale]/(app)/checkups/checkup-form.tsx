"use client";

/**
 * Checkup form — one keyboard-tabbable screen (vitals → diagnosis → conclusion
 * → recheck → status). Native <form action> posting to saveCheckupAction
 * (redirects to the queue on success).
 */

import { useActionState } from "react";
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

export function CheckupForm({ defaults }: { defaults: CheckupDefaults }) {
  const t = useTranslations("checkups");
  const [state, dispatch, isPending] = useActionState<CheckupSaveState, FormData>(saveCheckupAction, {
    status: "idle",
  });
  const formError = state.status === "error" ? state.formError : null;

  const textField = (name: keyof CheckupDefaults, label: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={defaults[name]} disabled={isPending} />
    </div>
  );

  const area = (name: keyof CheckupDefaults, label: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <textarea
        id={name}
        name={name}
        rows={3}
        defaultValue={defaults[name]}
        disabled={isPending}
        className={`${CONTROL} py-2`}
      />
    </div>
  );

  return (
    <form action={dispatch} noValidate className="space-y-5">
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
      {area("diagnosis", t("diagnosis"))}
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

      <Button type="submit" size="lg" disabled={isPending}>
        {isPending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
