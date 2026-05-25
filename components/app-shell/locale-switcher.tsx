"use client";

/**
 * Locale switcher — Client Component.
 *
 * Uses a native <select> (no shadcn dependency) to swap vi ↔ en while
 * preserving the current pathname. next-intl's useRouter().replace() handles
 * locale prefix rewriting transparently.
 */

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("app.localeSwitcher");

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const nextLocale = e.target.value as (typeof routing.locales)[number];
    router.replace(pathname, { locale: nextLocale });
  }

  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor="locale-select" className="text-muted-foreground sr-only text-xs">
        {t("label")}
      </label>
      <select
        id="locale-select"
        value={locale}
        onChange={handleChange}
        aria-label={t("label")}
        className="border-border bg-background text-foreground rounded-md border px-2 py-1 text-xs focus:outline-none"
      >
        {routing.locales.map((l) => (
          <option key={l} value={l}>
            {t(`locales.${l}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
