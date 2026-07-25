// WARNING: Do NOT add `'use cache'` — reads cookies() via the server client.

/**
 * Patient detail — Server Component. Shows the customer's profile (with the
 * province/ward codes resolved to readable names) and their checkup history,
 * newest first. Clinical-role gated by the patients layout.
 */

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

const STATUS_STYLE: Record<string, string> = {
  waiting: "bg-muted text-foreground",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  done: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
};

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations("patients");
  const tCheckups = await getTranslations("checkups");
  const customerId = Number(id);
  if (!Number.isFinite(customerId)) notFound();

  const supabase = await createSupabaseServerClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("id, first_name, last_name, dob, gender, phone, cccd, province_code, ward_code, address_detail")
    .eq("id", customerId)
    .eq("deleted", false)
    .maybeSingle();

  if (!customer) notFound();

  const [{ data: province }, { data: ward }, { data: checkups }] = await Promise.all([
    customer.province_code
      ? supabase.from("provinces").select("name").eq("code", customer.province_code).maybeSingle()
      : Promise.resolve({ data: null }),
    customer.ward_code
      ? supabase.from("wards").select("name").eq("code", customer.ward_code).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("checkups")
      .select("id, checkup_date, queue_number, status, doctor_id, diagnosis")
      .eq("customer_id", customerId)
      .eq("deleted", false)
      .order("checkup_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(50),
  ]);

  const rows = checkups ?? [];
  const doctorIds = [...new Set(rows.map((r) => r.doctor_id).filter((d): d is number => d != null))];
  const { data: doctors } = doctorIds.length
    ? await supabase.from("doctors").select("id, last_name, first_name").in("id", doctorIds)
    : { data: [] };
  const docName = new Map((doctors ?? []).map((d) => [d.id, `${d.last_name} ${d.first_name}`]));

  const address = [customer.address_detail, ward?.name, province?.name].filter(Boolean).join(", ");
  const fullName = `${customer.last_name} ${customer.first_name}`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-foreground text-xl font-semibold">{t("detailTitle", { name: fullName })}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {[
              customer.dob,
              customer.gender ? t(`gender.${customer.gender}`) : null,
              customer.phone,
              customer.cccd,
              address || null,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/patients/${customer.id}/edit`} locale={locale as "vi" | "en"}>
            {t("edit")}
          </Link>
        </Button>
      </div>

      <h2 className="text-foreground mb-3 text-sm font-medium">{t("history")}</h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("noHistory")}</p>
      ) : (
        <ul className="divide-border divide-y">
          {rows.map((c) => (
            <li key={c.id}>
              <Link
                href={`/checkups/${c.id}`}
                locale={locale as "vi" | "en"}
                className="hover:bg-accent -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-3"
              >
                <div className="min-w-0">
                  <p className="text-foreground text-sm font-medium">
                    {c.checkup_date}
                    {c.queue_number != null ? ` · #${c.queue_number}` : ""}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {[c.doctor_id ? (docName.get(c.doctor_id) ?? "—") : null, c.diagnosis]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[c.status] ?? "bg-muted"}`}
                >
                  {tCheckups(`status.${c.status}`)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
