// WARNING: Do NOT add `'use cache'` — reads cookies() via the server client.

/**
 * Queue — Server Component. Today's checkups by shift + a register form, with
 * live refresh (QueueRealtime). Clinical-role gated by the queue layout.
 */

import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerSession } from "@/lib/auth/get-server-session";
import { Button } from "@/components/ui/button";
import { RegisterForm } from "./register-form";
import { QueueRealtime } from "./queue-realtime";
import { CounterForm } from "./counter-form";
import { CallNextButton } from "./call-next-button";
import { callPatientAction } from "./actions";

const COUNTER_MANAGERS = new Set(["admin", "receptionist"]);

/** @type {Record<string, string>} */
const STATUS_STYLE = {
  waiting: "bg-muted text-foreground",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  done: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
};

/**
 * @param {{ params: Promise<{ locale: string }> }} props
 * @returns {Promise<import("react").JSX.Element>}
 */
export default async function QueuePage({ params }) {
  const { locale } = await params;
  const t = await getTranslations("queue");
  const tShift = await getTranslations("shifts");

  const supabase = await createSupabaseServerClient();
  const session = await getServerSession();
  const canManageCounter = COUNTER_MANAGERS.has(session?.role ?? "");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(
    new Date(),
  );

  const [
    { data: checkups },
    { data: patients },
    { data: shifts },
    { data: doctors },
    { data: counters },
  ] = await Promise.all([
    supabase
      .from("checkups")
      .select("id, queue_number, status, shift_id, customer_id, doctor_id")
      .eq("checkup_date", today)
      .eq("deleted", false)
      .order("shift_id", { ascending: true })
      .order("queue_number", { ascending: true }),
    supabase.rpc("search_customers", { q: "" }),
    supabase.from("shifts").select("id, code").order("sort_order", { ascending: true }),
    supabase
      .from("doctors")
      .select("id, last_name, first_name")
      .eq("deleted", false)
      .order("last_name"),
    supabase.from("daily_queue_counters").select("shift_id, last_number").eq("day", today),
  ]);

  const rows = checkups ?? [];
  const custIds = [...new Set(rows.map((r) => r.customer_id))];
  const { data: custs } = custIds.length
    ? await supabase.from("customers").select("id, last_name, first_name").in("id", custIds)
    : { data: [] };

  const custName = new Map((custs ?? []).map((c) => [c.id, `${c.last_name} ${c.first_name}`]));
  const docName = new Map((doctors ?? []).map((d) => [d.id, `${d.last_name} ${d.first_name}`]));
  const shiftCode = new Map((shifts ?? []).map((s) => [s.id, s.code]));
  const counterByShift = new Map((counters ?? []).map((c) => [c.shift_id, c.last_number]));

  /** @type {Map<number, number>} */
  const waitingCountByShift = new Map();
  for (const r of rows) {
    if (r.status === "waiting" && r.shift_id != null) {
      waitingCountByShift.set(r.shift_id, (waitingCountByShift.get(r.shift_id) ?? 0) + 1);
    }
  }
  const shiftsWithWaiting = (shifts ?? []).filter((s) => (waitingCountByShift.get(s.id) ?? 0) > 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <QueueRealtime />
      <h1 className="text-foreground mb-6 text-xl font-semibold">{t("title")}</h1>

      <section className="border-border mb-8 rounded-lg border p-4">
        <h2 className="text-foreground mb-3 text-sm font-medium">{t("callNext")}</h2>
        {shiftsWithWaiting.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noneWaiting")}</p>
        ) : (
          <div className="flex flex-wrap gap-6">
            {shiftsWithWaiting.map((s, i) => (
              <CallNextButton
                key={s.id}
                shiftId={s.id}
                shiftLabel={tShift(s.code)}
                waitingCount={waitingCountByShift.get(s.id) ?? 0}
                enableShortcut={i === 0}
              />
            ))}
          </div>
        )}
      </section>

      <section className="border-border mb-8 rounded-lg border p-4">
        <h2 className="text-foreground mb-3 text-sm font-medium">{t("counters")}</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {(shifts ?? []).map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3">
              <div>
                <p className="text-muted-foreground text-xs">
                  {tShift(s.code)} · {t("counter")}
                </p>
                <p className="text-foreground text-lg font-bold tabular-nums">
                  {counterByShift.get(s.id) ?? 0}
                </p>
              </div>
              {canManageCounter && (
                <CounterForm shiftId={s.id} currentValue={counterByShift.get(s.id) ?? 0} />
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="border-border mb-8 rounded-lg border p-4">
        <h2 className="text-foreground mb-3 text-sm font-medium">{t("registerTitle")}</h2>
        <RegisterForm
          patients={(patients ?? []).map(
            /** @param {{ id: number, last_name: string, first_name: string }} p */
            (p) => ({
              id: p.id,
              last_name: p.last_name,
              first_name: p.first_name,
            }),
          )}
          shifts={shifts ?? []}
          doctors={doctors ?? []}
        />
      </section>

      <h2 className="text-foreground mb-3 text-sm font-medium">
        {t("todayTitle", { count: rows.length })}
      </h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <ul className="divide-border divide-y">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="text-foreground w-10 shrink-0 text-center text-lg font-bold tabular-nums">
                  {c.queue_number ?? "—"}
                </span>
                <div className="min-w-0">
                  <p className="text-foreground truncate font-medium">
                    {custName.get(c.customer_id) ?? "—"}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {shiftCode.get(c.shift_id ?? -1)
                      ? tShift(/** @type {string} */ (shiftCode.get(c.shift_id ?? -1)))
                      : "—"}
                    {c.doctor_id ? ` · ${docName.get(c.doctor_id) ?? "—"}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[c.status] ?? "bg-muted"}`}
                >
                  {t(`status.${c.status}`)}
                </span>
                {c.status === "waiting" && (
                  <form action={callPatientAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <Button type="submit" variant="outline">
                      {t("call")}
                    </Button>
                  </form>
                )}
                <Button asChild variant="outline">
                  <Link href={`/checkups/${c.id}`} locale={/** @type {"vi" | "en"} */ (locale)}>
                    {t("open")}
                  </Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
