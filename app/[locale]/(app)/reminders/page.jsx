// WARNING: Do NOT add `'use cache'` — reads cookies() via the server client.

/**
 * Re-checkup reminders — patients whose recheck_date is due (today or past) or
 * upcoming within 7 days. Clinical staff call them in. VN-local dates.
 */

import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * @param {{ params: Promise<{ locale: string }> }} props
 * @returns {Promise<import("react").JSX.Element>}
 */
export default async function RemindersPage({ params }) {
  await params;
  const t = await getTranslations("reminders");

  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const now = new Date();
  const today = fmt.format(now);
  const horizon = fmt.format(new Date(now.getTime() + 7 * 86_400_000));
  // Lower bound so ancient overdue rows drop off instead of accumulating forever
  // and burying this-week reminders past the row limit.
  const floor = fmt.format(new Date(now.getTime() - 30 * 86_400_000));

  const supabase = await createSupabaseServerClient();
  const { data: checkups } = await supabase
    .from("checkups")
    .select("id, customer_id, recheck_date")
    .gte("recheck_date", floor)
    .lte("recheck_date", horizon)
    .eq("deleted", false)
    .order("recheck_date", { ascending: true })
    .limit(200);

  const rows = checkups ?? [];
  const custIds = [...new Set(rows.map((r) => r.customer_id))];
  const { data: custs } = custIds.length
    ? await supabase.from("customers").select("id, last_name, first_name, phone").in("id", custIds)
    : { data: [] };
  const cust = new Map((custs ?? []).map((c) => [c.id, c]));

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-foreground mb-6 text-xl font-semibold">{t("title")}</h1>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <ul className="divide-border divide-y">
          {rows.map((r) => {
            const c = cust.get(r.customer_id);
            const overdue = !!r.recheck_date && r.recheck_date < today;
            return (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-foreground truncate font-medium">
                    {c ? `${c.last_name} ${c.first_name}` : "—"}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">{c?.phone ?? ""}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-foreground text-sm tabular-nums">{r.recheck_date}</p>
                  <span
                    className={`text-xs font-medium ${overdue ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {overdue ? t("overdue") : t("upcoming")}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
