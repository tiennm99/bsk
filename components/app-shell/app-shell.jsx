/**
 * AppShell — Server Component.
 *
 * Renders the server-side Sidebar and hands it to AppShellFrame, which owns the
 * responsive chrome (persistent at md+, off-canvas drawer below md). Receives
 * user info from the (app) layout which has already validated session + role.
 */

import { Sidebar } from "@/components/app-shell/sidebar";
import { AppShellFrame } from "@/components/app-shell/app-shell-frame";

/**
 * @typedef {object} AppShellProps
 * @property {string} email
 * @property {string | null} fullName
 * @property {import("@/lib/db/roles").AppRole} role
 * @property {string} locale
 * @property {import("react").ReactNode} children
 */

/** @param {AppShellProps} props */
export function AppShell({ email, fullName, role, locale, children }) {
  return (
    <AppShellFrame
      sidebar={<Sidebar email={email} fullName={fullName} role={role} locale={locale} />}
    >
      {children}
    </AppShellFrame>
  );
}
