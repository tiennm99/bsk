// WARNING: Do NOT add `'use cache'` — requireRole() reads cookies().

import { requireRole } from "@/lib/auth/require-role";

/**
 * @param {{ children: import("react").ReactNode, params: Promise<{ locale: string }> }} props
 * @returns {Promise<import("react").JSX.Element>}
 */
export default async function CheckupsLayout({ children, params }) {
  const { locale } = await params;
  await requireRole(["admin", "receptionist", "doctor", "nurse"], locale);
  return <>{children}</>;
}
