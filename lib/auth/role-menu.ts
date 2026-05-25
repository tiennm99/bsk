/**
 * Role-based navigation menu mapping.
 *
 * ROLE_MENU is the single source of truth for what routes each role can access.
 * Server-rendered sidebar reads this; client never performs its own gating.
 *
 * labelKey values are i18n message keys resolved by the sidebar via
 * next-intl's `getTranslations`. Keep key names stable — renaming a key
 * requires updating messages/{vi,en}.json simultaneously.
 *
 * Add new items here when a new page lands; the sidebar renders them
 * automatically. Phase 2+ will append items for doctors, nurses, etc.
 */

import type { AppRole } from "@/lib/db/roles";
import type { ComponentType } from "react";
import { LayoutDashboard, UserPlus } from "lucide-react";

export type MenuItem = {
  /** Locale-relative path, e.g. "/dashboard". Sidebar prefixes with locale. */
  href: string;
  /** Key into the "nav" namespace in messages/{vi,en}.json */
  labelKey: string;
  /** Icon component from lucide-react */
  icon: ComponentType<{ className?: string }>;
};

/**
 * Menu items per role — Phase 1 minimal set.
 *
 * Only routes that exist are listed. Future phases append items here as
 * pages land. Non-existent routes are intentionally absent to avoid dead links.
 *
 * Phase 1 existing routes:
 *   /dashboard    — this phase
 *   /admin/invite — phase 05
 */
export const ROLE_MENU: Record<AppRole, MenuItem[]> = {
  admin: [
    { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
    { href: "/admin/invite", labelKey: "nav.invite", icon: UserPlus },
  ],
  doctor: [{ href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard }],
  nurse: [{ href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard }],
  receptionist: [{ href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard }],
  cashier: [{ href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard }],
  patient: [{ href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard }],
};
