"use client";

/**
 * Sign-out button — Client Component.
 *
 * Wraps signOutAction in a <form> so it works as a native form submission
 * (no JS required for the redirect). useFormStatus() disables the button
 * while the server action is in-flight to prevent double-submit.
 */

import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { signOutAction } from "@/app/[locale]/(auth)/sign-in/actions";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

function SignOutButtonInner() {
  const { pending } = useFormStatus();
  const t = useTranslations("app");

  return (
    <Button
      type="submit"
      variant="ghost"
      size="sm"
      disabled={pending}
      className="w-full justify-start gap-2"
    >
      <LogOut className="size-4" />
      {pending ? "…" : t("signOut")}
    </Button>
  );
}

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <SignOutButtonInner />
    </form>
  );
}
