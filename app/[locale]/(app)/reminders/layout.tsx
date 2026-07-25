// WARNING: Do NOT add `'use cache'` — requireRole() reads cookies().

import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/require-role";

export default async function RemindersLayout({
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
