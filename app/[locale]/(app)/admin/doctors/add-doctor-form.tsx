"use client";

/**
 * Add-doctor form — Client Component. Same wiring as invite-user-form:
 * RHF validates on blur for inline UX; useActionState dispatches the native
 * form action to createDoctorAction. Resets on success.
 */

import { useActionState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DoctorSchema, type DoctorInput, type DoctorFormState } from "@/lib/doctors/doctor-schema";
import { createDoctorAction } from "./actions";

export function AddDoctorForm() {
  const t = useTranslations("admin.doctors");

  const [state, dispatchAction, isPending] = useActionState<DoctorFormState, FormData>(
    createDoctorAction,
    { status: "idle" },
  );

  const form = useForm<DoctorInput>({
    resolver: zodResolver(DoctorSchema),
    mode: "onBlur",
    defaultValues: { firstName: "", lastName: "" },
  });

  const { errors: fieldErrors } = form.formState;

  useEffect(() => {
    if (state.status !== "error") return;
    if (state.fieldErrors.firstName?.length) {
      form.setError("firstName", { message: state.fieldErrors.firstName[0] });
    }
    if (state.fieldErrors.lastName?.length) {
      form.setError("lastName", { message: state.fieldErrors.lastName[0] });
    }
  }, [state, form]);

  useEffect(() => {
    if (state.status === "success") form.reset();
  }, [state, form]);

  const formError = state.status === "error" && state.formError ? state.formError : null;

  return (
    <form action={dispatchAction} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="doctor-last-name">{t("lastName")}</Label>
        <Input
          id="doctor-last-name"
          disabled={isPending}
          aria-invalid={!!fieldErrors.lastName}
          {...form.register("lastName")}
        />
        {fieldErrors.lastName && (
          <p className="text-destructive text-sm" role="alert">
            {fieldErrors.lastName.message}
          </p>
        )}
      </div>

      <div className="flex-1 space-y-1.5">
        <Label htmlFor="doctor-first-name">{t("firstName")}</Label>
        <Input
          id="doctor-first-name"
          disabled={isPending}
          aria-invalid={!!fieldErrors.firstName}
          {...form.register("firstName")}
        />
        {fieldErrors.firstName && (
          <p className="text-destructive text-sm" role="alert">
            {fieldErrors.firstName.message}
          </p>
        )}
      </div>

      <Button type="submit" size="lg" disabled={isPending}>
        {isPending ? t("submitting") : t("add")}
      </Button>

      {state.status === "success" && (
        <p className="text-sm font-medium text-green-600 sm:self-center" role="status">
          {t("added", { name: state.doctorName })}
        </p>
      )}
      {formError && (
        <p className="text-destructive text-sm sm:self-center" role="alert">
          {formError}
        </p>
      )}
    </form>
  );
}
