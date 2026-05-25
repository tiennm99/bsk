/**
 * Dashboard placeholder — Server Component.
 *
 * Displays a welcome message with the user's email and role.
 * Real dashboard content (stats, queues, etc.) lands in Phase 2+.
 */

import { getTranslations } from "next-intl/server";
import { getServerSession } from "@/lib/auth/get-server-session";

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  // params must be awaited in Next.js 16 App Router.
  await params;

  const t = await getTranslations("dashboard");
  const session = await getServerSession();

  // session is guaranteed non-null by the parent (app)/layout.tsx gate,
  // but we guard here to satisfy TypeScript's strict null checks.
  const email = session?.user.email ?? "";
  const role = session?.role ?? "";

  return (
    <div className="px-8 py-10">
      <h1 className="text-foreground text-2xl font-semibold">{t("welcome", { email })}</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        {t("roleLabel")}{" "}
        <span className="bg-muted text-foreground rounded px-1.5 py-0.5 text-xs font-medium">
          {role}
        </span>
      </p>
      <p className="text-muted-foreground mt-6 text-sm">{t("placeholder")}</p>
    </div>
  );
}
