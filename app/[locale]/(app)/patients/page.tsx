// WARNING: Do NOT add `'use cache'` — reads cookies() via the server client.

/**
 * Patients list + search — Server Component. Accent-insensitive search via the
 * search_customers RPC (empty query returns the first 50). Clinical-role gated
 * by the patients layout.
 */

import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deactivateCustomerAction } from "./actions";

export default async function PatientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  const { q = "" } = await searchParams;
  const t = await getTranslations("patients");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("search_customers", { q });
  type PatientRow = {
    id: number;
    first_name: string;
    last_name: string;
    phone: string | null;
    dob: string | null;
  };
  const patients = (data ?? []) as PatientRow[];

  // Recently seen: most recent distinct customers by their latest checkup.
  const { data: recentCheckups } = await supabase
    .from("checkups")
    .select("customer_id")
    .eq("deleted", false)
    .order("checkup_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(50);

  const seenIds = new Set<number>();
  const recentIds: number[] = [];
  for (const row of recentCheckups ?? []) {
    if (!seenIds.has(row.customer_id)) {
      seenIds.add(row.customer_id);
      recentIds.push(row.customer_id);
    }
    if (recentIds.length >= 8) break;
  }

  const { data: recentCustomers } = recentIds.length
    ? await supabase
        .from("customers")
        .select("id, last_name, first_name")
        .in("id", recentIds)
        .eq("deleted", false)
    : { data: [] };

  const recentNames = new Map(
    (recentCustomers ?? []).map((c) => [c.id, `${c.last_name} ${c.first_name}`]),
  );
  const recentlySeen = recentIds
    .filter((cid) => recentNames.has(cid))
    .map((cid) => ({ id: cid, name: recentNames.get(cid)! }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-foreground text-xl font-semibold">{t("title")}</h1>
        <Button asChild size="lg">
          <Link href="/patients/new" locale={locale as "vi" | "en"}>
            {t("new")}
          </Link>
        </Button>
      </div>

      {recentlySeen.length > 0 && (
        <section className="mb-6">
          <h2 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
            {t("recentlySeen")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {recentlySeen.map((p) => (
              <Link
                key={p.id}
                href={`/patients/${p.id}`}
                locale={locale as "vi" | "en"}
                className="border-border bg-muted/50 hover:bg-accent rounded-full border px-3 py-1 text-sm"
              >
                {p.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <form className="mb-6 flex gap-2">
        <Input
          name="q"
          defaultValue={q}
          placeholder={t("searchPlaceholder")}
          aria-label={t("search")}
        />
        <Button type="submit" variant="outline">
          {t("search")}
        </Button>
      </form>

      {patients.length === 0 ? (
        <p className="text-muted-foreground text-sm">{q ? t("noResults") : t("empty")}</p>
      ) : (
        <ul className="divide-border divide-y">
          {patients.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <Link
                  href={`/patients/${p.id}`}
                  locale={locale as "vi" | "en"}
                  className="text-foreground block truncate font-medium hover:underline"
                >
                  {p.last_name} {p.first_name}
                </Link>
                <p className="text-muted-foreground text-xs">
                  {[p.phone, p.dob].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button asChild variant="outline">
                  <Link href={`/patients/${p.id}/edit`} locale={locale as "vi" | "en"}>
                    {t("edit")}
                  </Link>
                </Button>
                <form action={deactivateCustomerAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <Button type="submit" variant="ghost" className="text-destructive">
                    {t("deactivate")}
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
