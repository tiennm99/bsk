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

/** @typedef {import("@/lib/db/roles").AppRole} AppRole */
/** @typedef {import("@/lib/auth/get-server-session").ServerSession} ServerSession */

/**
 * @param {readonly AppRole[]} allowed
 * @param {string} locale
 * @returns {Promise<ServerSession & { role: AppRole }>}
 */
export async function requireRole(allowed, locale) {
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

  return /** @type {ServerSession & { role: AppRole }} */ (session);
}
