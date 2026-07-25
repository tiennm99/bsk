// WARNING: Do NOT add `'use cache'` — reads cookies() via the server client.

/**
 * Queue — Server Component. Today's checkups by shift + a register form, with
 * live refresh (QueueRealtime). Clinical-role gated by the queue layout.
 */

import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { RegisterForm } from "./register-form";
import { QueueRealtime } from "./queue-realtime";
import { callPatientAction } from "./actions";

const STATUS_STYLE: Record<string, string> = {
  waiting: "bg-muted text-foreground",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  done: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
};

export default async function QueuePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("queue");
  const tShift = await getTranslations("shifts");

  const supabase = await createSupabaseServerClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

  const [{ data: checkups }, { data: patients }, { data: shifts }, { data: doctors }] =
    await Promise.all([
      supabase
        .from("checkups")
        .select("id, queue_number, status, shift_id, customer_id, doctor_id")
        .eq("checkup_date", today)
        .eq("deleted", false)
        .order("shift_id", { ascending: true })
        .order("queue_number", { ascending: true }),
      supabase.rpc("search_customers", { q: "" }),
      supabase.from("shifts").select("id, code").order("sort_order", { ascending: true }),
      supabase.from("doctors").select("id, last_name, first_name").eq("deleted", false).order("last_name"),
    ]);

  const rows = checkups ?? [];
  const custIds = [...new Set(rows.map((r) => r.customer_id))];
  const { data: custs } = custIds.length
    ? await supabase.from("customers").select("id, last_name, first_name").in("id", custIds)
    : { data: [] };

  const custName = new Map((custs ?? []).map((c) => [c.id, `${c.last_name} ${c.first_name}`]));
  const docName = new Map((doctors ?? []).map((d) => [d.id, `${d.last_name} ${d.first_name}`]));
  const shiftCode = new Map((shifts ?? []).map((s) => [s.id, s.code]));

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <QueueRealtime />
      <h1 className="text-foreground mb-6 text-xl font-semibold">{t("title")}</h1>

      <section className="border-border mb-8 rounded-lg border p-4">
        <h2 className="text-foreground mb-3 text-sm font-medium">{t("registerTitle")}</h2>
        <RegisterForm
          patients={(patients ?? []).map(
            (p: { id: number; last_name: string; first_name: string }) => ({
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
                    {shiftCode.get(c.shift_id ?? -1) ? tShift(shiftCode.get(c.shift_id ?? -1)!) : "—"}
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
                  <Link href={`/checkups/${c.id}`} locale={locale as "vi" | "en"}>
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
