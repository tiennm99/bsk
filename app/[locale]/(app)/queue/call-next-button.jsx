"use client";

/**
 * One-key "call next patient" button for a single shift. Submits to
 * callNextPatientAction (which redirects straight to the checkup screen on
 * success). When `enableShortcut` is set, also listens for the global
 * Alt+N shortcut and submits the same form — guarded so it never fires
 * while the user is typing in a field.
 */

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { callNextPatientAction } from "./actions";

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function CallNextButton({
  shiftId,
  shiftLabel,
  waitingCount,
  enableShortcut,
}: {
  shiftId: number;
  shiftLabel: string;
  waitingCount: number;
  enableShortcut: boolean;
}) {
  const t = useTranslations("queue");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!enableShortcut) return;

    function onKeyDown(event: KeyboardEvent) {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "n") return;

      const target = event.target as HTMLElement | null;
      if (target && (TYPING_TAGS.has(target.tagName) || target.isContentEditable)) return;

      event.preventDefault();
      formRef.current?.requestSubmit();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enableShortcut]);

  return (
    <div className="flex flex-col gap-1">
      <form ref={formRef} action={callNextPatientAction} className="flex items-center gap-3">
        <input type="hidden" name="shiftId" value={shiftId} />
        <Button type="submit" size="lg">
          {t("callNext")}
        </Button>
        {enableShortcut && (
          <span className="text-muted-foreground text-xs">{t("callNextHint")}</span>
        )}
      </form>
      <span className="text-muted-foreground text-xs">
        {t("callNextFor", { shift: shiftLabel, count: waitingCount })}
      </span>
    </div>
  );
}
