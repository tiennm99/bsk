"use client";

/**
 * Locale-subtree error boundary. Renders inside [locale]/layout (so next-intl
 * is available) when a route segment throws. No error details are shown to the
 * user — just a friendly message and a retry that re-renders the segment.
 */

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * @param {{ error: Error, reset: () => void }} props
 */
export default function LocaleError({ reset }) {
  const t = useTranslations("errors");
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="text-foreground text-xl font-semibold">{t("errorTitle")}</h1>
      <p className="text-muted-foreground mt-2 text-sm">{t("errorBody")}</p>
      <Button size="lg" className="mt-6" onClick={reset}>
        {t("retry")}
      </Button>
    </div>
  );
}
