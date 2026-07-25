/**
 * App sidebar — Server Component.
 *
 * Receives user email, role, and locale as props from the (app) layout.
 * Renders role-filtered menu items from ROLE_MENU using locale-aware Links.
 * No client state; active-link highlighting deferred to a later phase.
 */

import { getTranslations } from "next-intl/server";
import type { AppRole } from "@/lib/db/roles";
import { SidebarNav } from "@/components/app-shell/sidebar-nav";
import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { LocaleSwitcher } from "@/components/app-shell/locale-switcher";

type SidebarProps = {
  email: string;
  fullName: string | null;
  role: AppRole;
  locale: string;
};

export async function Sidebar({ email, fullName, role, locale }: SidebarProps) {
  const tRoles = await getTranslations("roles");

  return (
    <aside className="bg-background border-border flex h-full w-56 shrink-0 flex-col border-r">
      {/* Brand */}
      <div className="border-border border-b px-4 py-4">
        <span className="text-foreground text-lg font-bold tracking-tight">BSK</span>
        <p className="text-muted-foreground text-xs">Clinic Management</p>
      </div>

      {/* User info — greet by name when set; email drops to a secondary line. */}
      <div className="border-border border-b px-4 py-3">
        <p className="text-foreground truncate text-sm font-medium">{fullName || email}</p>
        {fullName && <p className="text-muted-foreground truncate text-xs">{email}</p>}
        <span className="bg-muted text-foreground mt-1 inline-block rounded px-1.5 py-0.5 text-xs font-medium">
          {tRoles(role)}
        </span>
      </div>

      {/* Nav items (client component: marks the active route) */}
      <SidebarNav role={role} locale={locale} />

      {/* Bottom actions */}
      <div className="border-border space-y-1 border-t px-2 py-3">
        <LocaleSwitcher />
        <SignOutButton />
      </div>
    </aside>
  );
}
