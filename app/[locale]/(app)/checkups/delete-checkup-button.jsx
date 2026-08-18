"use client";

/**
 * Delete control for a checkup. A plain `<form action>` can't confirm before
 * submitting, so this client component intercepts submit, asks via
 * window.confirm(), and cancels (preventDefault) if the user declines.
 */

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { deleteCheckupAction } from "./actions";

/**
 * @param {{ checkupId: number }} props
 */
export function DeleteCheckupButton({ checkupId }) {
  const t = useTranslations("checkups");

  /** @param {import("react").FormEvent<HTMLFormElement>} e */
  function onSubmit(e) {
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
