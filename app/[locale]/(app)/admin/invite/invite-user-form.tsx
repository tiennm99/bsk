"use client";

/**
 * Invite-user form — Client Component.
 *
 * Wiring: RHF owns client-side validation; useActionState dispatches the
 * native form action to inviteUserAction. Same pattern as sign-in-form.tsx.
 *
 * On success the form shows a confirmation message and resets.
 * On error the formError is displayed below the submit button.
 *
 * Email-delivery caveat (free-tier SMTP): if the invited user does not
 * receive the email within 5 minutes, the admin can copy the invite link
 * from the Supabase dashboard under Authentication → Users.
 */

import { useActionState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { appRoles } from "@/lib/db/roles";
import {
  InviteUserSchema,
  type InviteUserInput,
  type InviteUserState,
} from "@/lib/auth/invite-schema";
import { inviteUserAction } from "./actions";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InviteUserForm() {
  const t = useTranslations("admin.invite");

  const [state, dispatchAction, isPending] = useActionState<InviteUserState, FormData>(
    inviteUserAction,
    { status: "idle" },
  );

  const form = useForm<InviteUserInput>({
    resolver: zodResolver(InviteUserSchema),
    mode: "onBlur",
    defaultValues: { email: "", role: "patient" },
  });

  const { errors: fieldErrors } = form.formState;

  // Sync server field errors into RHF so inline error UI is consistent.
  useEffect(() => {
    if (state.status !== "error") return;
    const serverErrors = state.fieldErrors;
    if (serverErrors.email?.length) {
      form.setError("email", { message: serverErrors.email[0] });
    }
    if (serverErrors.role?.length) {
      form.setError("role", { message: serverErrors.role[0] });
    }
  }, [state, form]);

  // Reset form after a successful invite.
  useEffect(() => {
    if (state.status === "success") {
      form.reset();
    }
  }, [state, form]);

  const formError = state.status === "error" && state.formError ? state.formError : null;

  return (
    <div className="space-y-6">
      {/* Success banner */}
      {state.status === "success" && (
        <p className="text-sm font-medium text-green-600" role="status">
          {t("success", { email: state.invitedEmail })}
        </p>
      )}

      <form action={dispatchAction} noValidate className="space-y-4">
        {/* Email */}
        <div className="space-y-1.5">
          <Label htmlFor="invite-email">{t("emailLabel")}</Label>
          <Input
            id="invite-email"
            type="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={isPending}
            aria-invalid={!!fieldErrors.email}
            aria-describedby={fieldErrors.email ? "invite-email-error" : undefined}
            {...form.register("email")}
          />
          {fieldErrors.email && (
            <p id="invite-email-error" className="text-destructive text-sm" role="alert">
              {fieldErrors.email.message}
            </p>
          )}
        </div>

        {/* Role */}
        <div className="space-y-1.5">
          <Label htmlFor="invite-role">{t("roleLabel")}</Label>
          {/*
            Native <select> used intentionally to avoid pulling in the shadcn
            Select primitive (extra scope). Can be swapped in phase 06+ if
            design system requires it.
          */}
          <select
            id="invite-role"
            className="border-input bg-background text-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none disabled:opacity-50"
            disabled={isPending}
            aria-invalid={!!fieldErrors.role}
            aria-describedby={fieldErrors.role ? "invite-role-error" : undefined}
            {...form.register("role")}
          >
            {appRoles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          {fieldErrors.role && (
            <p id="invite-role-error" className="text-destructive text-sm" role="alert">
              {fieldErrors.role.message}
            </p>
          )}
        </div>

        {/* Form-level error */}
        {formError && (
          <p className="text-destructive text-sm" role="alert">
            {formError}
          </p>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={isPending || (!form.formState.isValid && form.formState.isDirty)}
          aria-disabled={isPending}
        >
          {isPending ? t("submitting") : t("submit")}
        </Button>
      </form>
    </div>
  );
}
