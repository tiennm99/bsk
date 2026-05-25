// WARNING: Do NOT add `'use cache'` here — getServerSession() reads cookies().
// Caching this scope would serve stale auth state across users.

/**
 * (app) route-group layout — Server Component.
 *
 * Gate: requires a valid session AND a non-null role.
 *   - No session (unauthenticated)  → redirect to /sign-in
 *   - Session but role is null      → user is authed but unenrolled (e.g. admin
 *     deleted their app_users row mid-session). Sign out and redirect to /sign-in
 *     so the user is not silently stuck in a broken state.
 *   - Session + role present        → render the AppShell.
 *
 * The proxy (middleware) already redirects unauthenticated requests away from
 * /dashboard and /admin. This layout is defense-in-depth and handles the
 * "authed but unenrolled" edge case the proxy cannot detect.
 */

import type { ReactNode } from "react";
import { redirect } from "@/i18n/navigation";
import { getServerSession } from "@/lib/auth/get-server-session";
import { signOutAction } from "@/app/[locale]/(auth)/sign-in/actions";
import { AppShell } from "@/components/app-shell/app-shell";

export default async function AppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const session = await getServerSession();

  // Unauthenticated — defense-in-depth (proxy already handles most cases).
  if (!session) {
    redirect({ href: `/${locale}/sign-in`, locale });
    // TypeScript: redirect() throws a Next.js redirect symbol; unreachable.
    return null;
  }

  // Authed but unenrolled — sign out so the Supabase cookie is cleared, then
  // redirect. Prevents a user whose app_users row was deleted from looping on
  // the dashboard with a valid JWT but no BSK role.
  if (!session.role) {
    await signOutAction();
    // signOutAction calls redirect() internally and never returns normally;
    // the line below satisfies TypeScript's control-flow analysis.
    return null;
  }

  const { user, role } = session;

  return (
    <AppShell email={user.email ?? ""} role={role} locale={locale}>
      {children}
    </AppShell>
  );
}
