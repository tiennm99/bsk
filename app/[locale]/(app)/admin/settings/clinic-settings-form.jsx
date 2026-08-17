"use client";

/**
 * Clinic-settings form — Client Component. RHF (onBlur) + useActionState,
 * prefilled from the current row. Same wiring as the other admin forms.
 */

import { useActionState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ClinicSettingsSchema,
  type ClinicSettingsInput,
  type ClinicSettingsState,
} from "@/lib/clinic/clinic-settings-schema";
import { updateClinicSettingsAction } from "./actions";

const FIELDS = ["name", "address", "phone", "prefix"] as const;

export function ClinicSettingsForm({ defaults }: { defaults: ClinicSettingsInput }) {
  const t = useTranslations("admin.settings");

  const [state, dispatchAction, isPending] = useActionState<ClinicSettingsState, FormData>(
    updateClinicSettingsAction,
    { status: "idle" },
  );

  const form = useForm<ClinicSettingsInput>({
    resolver: zodResolver(ClinicSettingsSchema),
    mode: "onBlur",
    defaultValues: defaults,
  });

  const { errors } = form.formState;

  useEffect(() => {
    if (state.status !== "error") return;
    for (const f of FIELDS) {
      if (state.fieldErrors[f]?.length) form.setError(f, { message: state.fieldErrors[f][0] });
    }
  }, [state, form]);

  const formError = state.status === "error" && state.formError ? state.formError : null;

  return (
    <form action={dispatchAction} noValidate className="space-y-4">
      {FIELDS.map((f) => (
        <div key={f} className="space-y-1.5">
          <Label htmlFor={`clinic-${f}`}>{t(f)}</Label>
          <Input
            id={`clinic-${f}`}
            disabled={isPending}
            aria-invalid={!!errors[f]}
            {...form.register(f)}
          />
          {errors[f] && (
            <p className="text-destructive text-sm" role="alert">
              {errors[f]?.message}
            </p>
          )}
        </div>
      ))}

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending ? t("submitting") : t("save")}
        </Button>
        {state.status === "success" && (
          <p className="text-sm font-medium text-green-600" role="status">
            {t("saved")}
          </p>
        )}
        {formError && (
          <p className="text-destructive text-sm" role="alert">
            {formError}
          </p>
        )}
      </div>
    </form>
  );
}
