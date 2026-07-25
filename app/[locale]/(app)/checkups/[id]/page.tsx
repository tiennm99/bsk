// WARNING: Do NOT add `'use cache'` — reads cookies() via the server client.

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { CheckupForm } from "../checkup-form";
import { DeleteCheckupButton } from "../delete-checkup-button";

const str = (v: string | number | null) => (v == null ? "" : String(v));

export default async function CheckupPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations("checkups");
  const tBilling = await getTranslations("billing");
  const tImaging = await getTranslations("imaging");
  const checkupId = Number(id);
  if (!Number.isFinite(checkupId)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: c } = await supabase
    .from("checkups")
    .select(
      "id, customer_id, queue_number, status, heart_beat, blood_pressure, temperature, weight, height, symptoms, diagnosis, conclusion, notes, recheck_date",
    )
    .eq("id", checkupId)
    .eq("deleted", false)
    .maybeSingle();

  if (!c) notFound();

  const { data: customer } = await supabase
    .from("customers")
    .select("last_name, first_name, dob, gender, phone")
    .eq("id", c.customer_id)
    .maybeSingle();

  const patientName = customer ? `${customer.last_name} ${customer.first_name}` : "—";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            {c.queue_number != null && (
              <span className="text-foreground text-2xl font-bold tabular-nums">#{c.queue_number}</span>
            )}
            <h1 className="text-foreground text-xl font-semibold">{patientName}</h1>
          </div>
          {customer && (
            <p className="text-muted-foreground mt-1 text-sm">
              {[customer.phone, customer.dob].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/checkups/${c.id}/prescription`} locale={locale as "vi" | "en"}>
              {tBilling("title")}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/checkups/${c.id}/imaging`} locale={locale as "vi" | "en"}>
              {tImaging("title")}
            </Link>
          </Button>
          <DeleteCheckupButton checkupId={c.id} />
        </div>
      </div>

      <CheckupForm
        defaults={{
          id: c.id,
          heartBeat: str(c.heart_beat),
          bloodPressure: str(c.blood_pressure),
          temperature: str(c.temperature),
          weight: str(c.weight),
          height: str(c.height),
          symptoms: str(c.symptoms),
          diagnosis: str(c.diagnosis),
          conclusion: str(c.conclusion),
          notes: str(c.notes),
          recheckDate: str(c.recheck_date),
          status: c.status,
        }}
      />
      <p className="sr-only">{t("title")}</p>
    </div>
  );
}
