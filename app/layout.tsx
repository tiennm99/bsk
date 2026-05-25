import type { ReactNode } from "react";

// Intentionally empty pass-through. The real `<html>` + `<body>` live in
// `app/[locale]/layout.tsx` so `lang={locale}` and the i18n provider can
// be set per locale. Do not put global UI here.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
