/**
 * AppShell — Server Component.
 *
 * Renders the server-side Sidebar and hands it to AppShellFrame, which owns the
 * responsive chrome (persistent at md+, off-canvas drawer below md). Receives
 * user info from the (app) layout which has already validated session + role.
 */

import type { ReactNode } from "react";
import type { AppRole } from "@/lib/db/roles";
import { Sidebar } from "@/components/app-shell/sidebar";
import { AppShellFrame } from "@/components/app-shell/app-shell-frame";

type AppShellProps = {
  email: string;
  fullName: string | null;
  role: AppRole;
  locale: string;
  children: ReactNode;
};

export function AppShell({ email, fullName, role, locale, children }: AppShellProps) {
  return (
    <AppShellFrame
      sidebar={<Sidebar email={email} fullName={fullName} role={role} locale={locale} />}
    >
      {children}
    </AppShellFrame>
  );
}
