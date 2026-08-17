// WARNING: Do NOT add `'use cache'` — requireRole() reads cookies().

/**
 * Patients route-group layout. Restricts /patients/** to clinical roles
 * (admin, receptionist, doctor, nurse). Cashier/patient are redirected to
 * /dashboard by requireRole.
 */

import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/require-role";

export default async function PatientsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireRole(["admin", "receptionist", "doctor", "nurse"], locale);
  return <>{children}</>;
}
