import type { ReactNode } from "react";

// Intentionally empty pass-through. The real `<html>` + `<body>` live in
// `app/[locale]/layout.tsx` so `lang={locale}` and the i18n provider can
// be set per locale. Do not put global UI here.
//
// `global-error.tsx` (anywhere in the tree) MUST render its own
// `<html><body>` — Next.js renders it instead of the root layout. This rule
// is universal, not specific to this codebase.
//
// `error.tsx` normally inherits its closest layout's shell. But because the
// root layout here is a passthrough, a hypothetical `app/error.tsx` would
// render without `<html><body>`. Prefer placing `error.tsx` files under
// `app/[locale]/` (where the real shell lives), or render the document
// shell explicitly inside any root-level error file.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
