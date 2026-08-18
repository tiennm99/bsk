import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: /** @type {const} */ (["vi", "en"]),
  defaultLocale: "vi",
  localePrefix: "as-needed",
});

/** @typedef {(typeof routing.locales)[number]} Locale */
