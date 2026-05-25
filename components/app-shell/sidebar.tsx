/**
 * App sidebar — Server Component.
 *
 * Receives user email, role, and locale as props from the (app) layout.
 * Renders role-filtered menu items from ROLE_MENU using locale-aware Links.
 * No client state; active-link highlighting deferred to a later phase.
 */

import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ROLE_MENU } from "@/lib/auth/role-menu";
import type { AppRole } from "@/lib/db/roles";
import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { LocaleSwitcher } from "@/components/app-shell/locale-switcher";

type SidebarProps = {
  email: string;
  role: AppRole;
  locale: string;
};

export async function Sidebar({ email, role, locale }: SidebarProps) {
  const t = await getTranslations();
  const items = ROLE_MENU[role];

  return (
    <aside className="bg-background border-border flex h-full w-56 shrink-0 flex-col border-r">
      {/* Brand */}
      <div className="border-border border-b px-4 py-4">
        <span className="text-foreground text-lg font-bold tracking-tight">BSK</span>
        <p className="text-muted-foreground text-xs">Clinic Management</p>
      </div>

      {/* User info */}
      <div className="border-border border-b px-4 py-3">
        <p className="text-foreground truncate text-sm font-medium">{email}</p>
        <span className="bg-muted text-muted-foreground mt-1 inline-block rounded px-1.5 py-0.5 text-xs font-medium">
          {role}
        </span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Main navigation">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  locale={locale as "vi" | "en"}
                  className="text-foreground hover:bg-muted flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors"
                >
                  <Icon className="size-4 shrink-0" />
                  {t(item.labelKey as Parameters<typeof t>[0])}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom actions */}
      <div className="border-border space-y-1 border-t px-2 py-3">
        <LocaleSwitcher />
        <SignOutButton />
      </div>
    </aside>
  );
}
