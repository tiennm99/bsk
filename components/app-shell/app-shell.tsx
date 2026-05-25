/**
 * AppShell — Server Component.
 *
 * Composes the full authenticated layout: fixed sidebar on the left,
 * scrollable main content area on the right. Receives user info from the
 * (app) layout which has already validated session + role.
 *
 * No client state here — sidebar is server-rendered, top-bar lives inside
 * the sidebar's bottom section for Phase 1 simplicity.
 */

import type { ReactNode } from "react";
import type { AppRole } from "@/lib/db/roles";
import { Sidebar } from "@/components/app-shell/sidebar";

type AppShellProps = {
  email: string;
  role: AppRole;
  locale: string;
  children: ReactNode;
};

export function AppShell({ email, role, locale, children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar email={email} role={role} locale={locale} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
