// WARNING: Do NOT add `'use cache'` — reads cookies() via the server client.

/**
 * Dashboard — greeting + today's queue/completed tiles + a 7-day paid-revenue
 * chart (revenue shown to admin/cashier only). All dates are VN-local.
 */

import { getTranslations } from "next-intl/server";
import { getServerSession } from "@/lib/auth/get-server-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RevenueChart } from "./revenue-chart";

const vnd = (n: number) => `${new Intl.NumberFormat("vi-VN").format(n)} ₫`;

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  await params;

  const t = await getTranslations("dashboard");
  const tReports = await getTranslations("reports");
  const tRoles = await getTranslations("roles");
  const session = await getServerSession();

  const email = session?.user.email ?? "";
  const role = session?.role;
  const name = session?.fullName || email;
  const canSeeRevenue = role === "admin" || role === "cashier";

  // VN-local last 7 days (oldest → newest); today is days[6].
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const now = new Date();
  const days = Array.from({ length: 7 }, (_, i) =>
    fmt.format(new Date(now.getTime() - (6 - i) * 86_400_000)),
  );
  const today = days[6];

  const supabase = await createSupabaseServerClient();

  const [{ count: waiting }, { count: completed }, { data: weekCheckups }] = await Promise.all([
    supabase
      .from("checkups")
      .select("id", { count: "exact", head: true })
      .eq("checkup_date", today)
      .eq("deleted", false)
      .in("status", ["waiting", "in_progress"]),
    supabase
      .from("checkups")
      .select("id", { count: "exact", head: true })
      .eq("checkup_date", today)
      .eq("deleted", false)
      .eq("status", "done"),
    canSeeRevenue
      ? supabase
          .from("checkups")
          .select("id, checkup_date")
          .gte("checkup_date", days[0])
          .lte("checkup_date", today)
          .eq("deleted", false)
      : Promise.resolve({ data: [] as { id: number; checkup_date: string }[] }),
  ]);

  let revenue7d = days.map((d) => ({ day: d.slice(5), amount: 0 }));
  let revenueTotal = 0;
  if (canSeeRevenue && weekCheckups && weekCheckups.length) {
    const ids = weekCheckups.map((c) => c.id);
    const [{ data: paidOrders }, { data: oi }, { data: cs }] = await Promise.all([
      supabase.from("medicine_orders").select("checkup_id").eq("payment_status", "paid").in("checkup_id", ids),
      supabase.from("order_items").select("checkup_id, line_total").in("checkup_id", ids),
      supabase.from("checkup_services").select("checkup_id, line_total").in("checkup_id", ids),
    ]);
    const paid = new Set((paidOrders ?? []).map((o) => o.checkup_id));
    const dateOf = new Map(weekCheckups.map((c) => [c.id, c.checkup_date]));
    const totalByCheckup = new Map<number, number>();
    for (const r of [...(oi ?? []), ...(cs ?? [])]) {
      totalByCheckup.set(r.checkup_id, (totalByCheckup.get(r.checkup_id) ?? 0) + r.line_total);
    }
    const byDay = new Map(days.map((d) => [d, 0]));
    for (const [cid, dt] of dateOf) {
      if (paid.has(cid)) byDay.set(dt, (byDay.get(dt) ?? 0) + (totalByCheckup.get(cid) ?? 0));
    }
    revenue7d = days.map((d) => ({ day: d.slice(5), amount: byDay.get(d) ?? 0 }));
    revenueTotal = revenue7d.reduce((s, r) => s + r.amount, 0);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-foreground text-2xl font-semibold">{t("welcome", { name })}</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        {t("roleLabel")}{" "}
        <span className="bg-muted text-foreground rounded px-1.5 py-0.5 text-xs font-medium">
          {role ? tRoles(role) : ""}
        </span>
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="border-border rounded-lg border p-4">
          <p className="text-muted-foreground text-xs">{tReports("todayQueue")}</p>
          <p className="text-foreground mt-1 text-2xl font-bold tabular-nums">{waiting ?? 0}</p>
        </div>
        <div className="border-border rounded-lg border p-4">
          <p className="text-muted-foreground text-xs">{tReports("todayCompleted")}</p>
          <p className="text-foreground mt-1 text-2xl font-bold tabular-nums">{completed ?? 0}</p>
        </div>
        {canSeeRevenue && (
          <div className="border-border rounded-lg border p-4">
            <p className="text-muted-foreground text-xs">{tReports("revenue7d")}</p>
            <p className="text-foreground mt-1 text-2xl font-bold tabular-nums">{vnd(revenueTotal)}</p>
          </div>
        )}
      </div>

      {canSeeRevenue && (
        <div className="border-border mt-6 rounded-lg border p-4">
          <p className="text-muted-foreground mb-3 text-sm font-medium">{tReports("revenue7d")}</p>
          <RevenueChart data={revenue7d} />
        </div>
      )}
    </div>
  );
}
