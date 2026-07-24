"use client";

/**
 * Sidebar navigation list — Client Component.
 *
 * Split out from the (Server) Sidebar so it can read the current pathname and
 * mark the active route. It imports ROLE_MENU directly (icons are client-safe
 * lucide components) rather than receiving menu items as props — component
 * types can't cross the RSC boundary.
 *
 * Active detection: next-intl's usePathname() returns the locale-stripped
 * pathname (e.g. "/dashboard"), matching the locale-relative item.href.
 */

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { ROLE_MENU } from "@/lib/auth/role-menu";
import type { AppRole } from "@/lib/db/roles";

type SidebarNavProps = {
  role: AppRole;
  locale: string;
};

export function SidebarNav({ role, locale }: SidebarNavProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const items = ROLE_MENU[role];

  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Main navigation">
      <ul className="space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                locale={locale as "vi" | "en"}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-11 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-muted text-foreground font-medium"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <Icon className="size-4 shrink-0" />
                {t(item.labelKey as Parameters<typeof t>[0])}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
