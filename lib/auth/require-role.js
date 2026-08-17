import "server-only";

/**
 * Server-side role gate helper.
 *
 * Call from route layouts that restrict access to one or more roles.
 * Redirects unauthenticated users to /sign-in and unauthorized users
 * (wrong role) to /dashboard.
 *
 * redirect() is intentionally called OUTSIDE any try/catch — Next.js 16
 * implements redirect() via a thrown symbol; catching it silently drops the
 * redirect.
 *
 * Usage:
 *   const session = await requireRole(['admin'], locale);
 *   // session.user and session.role are guaranteed non-null here
 */

import { redirect } from "@/i18n/navigation";
import { getServerSession } from "@/lib/auth/get-server-session";
import type { AppRole } from "@/lib/db/roles";
import type { ServerSession } from "@/lib/auth/get-server-session";

export async function requireRole(
  allowed: AppRole[],
  locale: string,
): Promise<ServerSession & { role: AppRole }> {
  const session = await getServerSession();

  if (!session?.user) {
    redirect({ href: `/${locale}/sign-in`, locale });
    // TypeScript: redirect() throws, this line is unreachable
    throw new Error("unreachable");
  }

  if (!session.role || !allowed.includes(session.role)) {
    redirect({ href: `/${locale}/dashboard`, locale });
    throw new Error("unreachable");
  }

  return session as ServerSession & { role: AppRole };
}
