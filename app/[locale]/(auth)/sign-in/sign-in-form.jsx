"use client";

/**
 * Sign-in form — Client Component.
 *
 * Wiring: RHF owns client-side validation state; useActionState dispatches
 * the native form action to signInAction (Server Action). The form root uses
 * `<form action={dispatchAction}>` — NOT onSubmit={form.handleSubmit(...)}.
 * RHF runs in mode:"onBlur" so field errors appear as soon as a user leaves
 * a field, without blocking the native submit path.
 *
 * Server-returned fieldErrors are synced into RHF via useEffect so the inline
 * error UI stays consistent regardless of whether the error originated client-
 * side or server-side.
 */

import { useActionState, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignInSchema } from "@/lib/auth/schemas";
import { signInAction } from "./actions";

/** @typedef {import('@/lib/auth/schemas').SignInInput} SignInInput */
/** @typedef {import('@/lib/auth/schemas').SignInState} SignInState */

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Email/password sign-in form backed by a server action. @returns {import("react").JSX.Element} */
export function SignInForm() {
  const t = useTranslations("auth.signIn");

  // useActionState wires React 19's form action mechanism.
  // isPending reflects the Transition wrapping the Server Action round-trip.
  const [state, dispatchAction, isPending] = useActionState(signInAction, {
    status: "idle",
  });

  // RHF: client-side Zod validation for instant inline feedback.
  // mode:"onBlur" fires validation when the user leaves a field.
  const form = useForm({
    resolver: zodResolver(SignInSchema),
    mode: "onBlur",
    defaultValues: { email: "", password: "" },
  });

  const { errors: fieldErrors } = form.formState;

  // Password reveal toggle — shared clinic PCs + VN keyboards make mistyped
  // passwords common; letting the doctor verify what they typed cuts retries.
  const [showPassword, setShowPassword] = useState(false);

  // Sync server-returned fieldErrors into RHF so the inline error UI is
  // consistent regardless of where the error originated.
  useEffect(() => {
    if (state.status !== "error") return;
    const serverErrors = state.fieldErrors;
    if (serverErrors.email?.length) {
      form.setError("email", { message: serverErrors.email[0] });
    }
    if (serverErrors.password?.length) {
      form.setError("password", { message: serverErrors.password[0] });
    }
  }, [state, form]);

  // Derive form-level error message from server state.
  const formError = state.status === "error" && state.formError ? state.formError : null;

  return (
    <div>
      {/* Page heading */}
      <div className="mb-6 text-center">
        <h1 className="text-foreground text-xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
      </div>

      {/*
        Form root uses the native `action` prop to wire the Server Action.
        RHF validates on blur for UX; the native form action handles submission.
      */}
      <form action={dispatchAction} noValidate className="space-y-4">
        {/* Email field */}
        <div className="space-y-1.5">
          <Label htmlFor="email">{t("emailLabel")}</Label>
          <Input
            id="email"
            type="email"
            autoFocus
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            disabled={isPending}
            aria-invalid={!!fieldErrors.email}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
            {...form.register("email")}
          />
          {fieldErrors.email && (
            <p id="email-error" className="text-destructive text-sm" role="alert">
              {fieldErrors.email.message}
            </p>
          )}
        </div>

        {/* Password field */}
        <div className="space-y-1.5">
          <Label htmlFor="password">{t("passwordLabel")}</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              disabled={isPending}
              className="pr-10"
              aria-invalid={!!fieldErrors.password}
              aria-describedby={fieldErrors.password ? "password-error" : undefined}
              {...form.register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              disabled={isPending}
              aria-label={showPassword ? t("hidePassword") : t("showPassword")}
              aria-pressed={showPassword}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-md focus:outline-none focus-visible:ring-2"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {fieldErrors.password && (
            <p id="password-error" className="text-destructive text-sm" role="alert">
              {fieldErrors.password.message}
            </p>
          )}
        </div>

        {/* Form-level error (invalid credentials, server error) */}
        {formError && (
          <p className="text-destructive text-sm" role="alert">
            {formError}
          </p>
        )}

        {/* Submit */}
        {/* Submit stays enabled on partial/invalid input: a greyed-out primary
            button reads as "app broken". Errors surface inline on submit. */}
        <Button type="submit" size="lg" className="w-full" disabled={isPending}>
          {isPending ? t("submitting") : t("submit")}
        </Button>
      </form>
    </div>
  );
}
