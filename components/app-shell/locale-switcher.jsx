"use client";

/**
 * Locale switcher — Client Component.
 *
 * Uses a native <select> (no shadcn dependency) to swap vi ↔ en while
 * preserving the current pathname. next-intl's useRouter().replace() handles
 * locale prefix rewriting transparently.
 */

import { useId } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/** Dropdown that switches the active locale while preserving the path. @returns {import("react").JSX.Element} */
export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("app.localeSwitcher");
  // useId keeps the id unique even when the sidebar is rendered in two DOM
  // slots (desktop rail + mobile drawer) — no duplicate id / label collision.
  const selectId = useId();

  /** @param {import("react").ChangeEvent<HTMLSelectElement>} e */
  function handleChange(e) {
    const nextLocale = /** @type {(typeof routing.locales)[number]} */ (e.target.value);
    router.replace(pathname, { locale: nextLocale });
  }

  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={selectId} className="text-muted-foreground sr-only text-xs">
        {t("label")}
      </label>
      <select
        id={selectId}
        value={locale}
        onChange={handleChange}
        aria-label={t("label")}
        className="border-border bg-background text-foreground focus-visible:ring-ring rounded-md border px-2 py-2 text-xs focus:outline-none focus-visible:ring-2"
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
