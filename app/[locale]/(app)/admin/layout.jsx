// WARNING: Do NOT add `'use cache'` here — requireRole() reads cookies().

/**
 * Admin route-group layout — Server Component.
 *
 * Second gate for all routes under /admin/**. The parent (app)/layout.tsx
 * already validated that a session exists; this layout additionally enforces
 * role === 'admin'.
 *
 * Non-admin authenticated users are redirected to /dashboard rather than
 * receiving a 404, which would confirm that restricted admin routes exist.
 */

import { requireRole } from "@/lib/auth/require-role";

/**
 * @param {{ children: import("react").ReactNode, params: Promise<{ locale: string }> }} props
 * @returns {Promise<import("react").JSX.Element>}
 */
export default async function AdminLayout({ children, params }) {
  const { locale } = await params;

  // Redirects to /dashboard if role !== 'admin'.
  await requireRole(["admin"], locale);

  return <>{children}</>;
}
