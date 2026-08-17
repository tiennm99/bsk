// WARNING: Do NOT add `'use cache'` — requireRole() reads cookies().

/**
 * Patients route-group layout. Restricts /patients/** to clinical roles
 * (admin, receptionist, doctor, nurse). Cashier/patient are redirected to
 * /dashboard by requireRole.
 */

import { requireRole } from "@/lib/auth/require-role";

/**
 * @param {{ children: import("react").ReactNode, params: Promise<{ locale: string }> }} props
 * @returns {Promise<import("react").JSX.Element>}
 */
export default async function PatientsLayout({ children, params }) {
  const { locale } = await params;
  await requireRole(["admin", "receptionist", "doctor", "nurse"], locale);
  return <>{children}</>;
}
