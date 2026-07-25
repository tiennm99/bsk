"use client";

/**
 * Delete control for a checkup. A plain `<form action>` can't confirm before
 * submitting, so this client component intercepts submit, asks via
 * window.confirm(), and cancels (preventDefault) if the user declines.
 */

import type { FormEvent } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { deleteCheckupAction } from "./actions";

export function DeleteCheckupButton({ checkupId }: { checkupId: number }) {
  const t = useTranslations("checkups");

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    if (!window.confirm(t("confirmDelete"))) {
      e.preventDefault();
    }
  }

  return (
    <form action={deleteCheckupAction} onSubmit={onSubmit}>
      <input type="hidden" name="id" value={checkupId} />
      <Button type="submit" variant="ghost" className="text-destructive">
        {t("delete")}
      </Button>
    </form>
  );
}
