// WARNING: Do NOT add `'use cache'` — reads cookies() via the server client.

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fieldsJsonToLabels } from "@/lib/templates/template-schema";
import { Button } from "@/components/ui/button";
import { CheckupForm } from "../checkup-form";
import { DeleteCheckupButton } from "../delete-checkup-button";

/** @param {string | number | null} v */
const str = (v) => (v == null ? "" : String(v));

/**
 * @param {{ params: Promise<{ locale: string, id: string }> }} props
 * @returns {Promise<import("react").JSX.Element>}
 */
export default async function CheckupPage({ params }) {
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
      "id, customer_id, queue_number, status, heart_beat, blood_pressure, temperature, weight, height, symptoms, diagnosis, conclusion, notes, recheck_date, template_id, template_values",
    )
    .eq("id", checkupId)
    .eq("deleted", false)
    .maybeSingle();

  if (!c) notFound();

  const [{ data: customer }, { data: templates }, { data: recentDiagnoses }] = await Promise.all([
    supabase
      .from("customers")
      .select("last_name, first_name, dob, gender, phone")
      .eq("id", c.customer_id)
      .maybeSingle(),
    supabase
      .from("checkup_templates")
      .select("id, name, gender, fields")
      .eq("deleted", false)
      .order("name", { ascending: true }),
    supabase
      .from("checkups")
      .select("diagnosis")
      .not("diagnosis", "is", null)
      .eq("deleted", false)
      .order("checkup_date", { ascending: false })
      .limit(200),
  ]);

  // De-dupe + trim recent diagnoses for the quick-pick, capped at 50 entries.
  const diagnosisSuggestions = [
    ...new Set(
      (recentDiagnoses ?? [])
        .map((r) => r.diagnosis?.trim())
        .filter(/** @returns {d is string} */ (d) => !!d),
    ),
  ].slice(0, 50);

  const patientName = customer ? `${customer.last_name} ${customer.first_name}` : "—";

  // Prefer templates matching the patient's gender (or applicable to "any");
  // keep the full list when the patient has no gender on file.
  const applicableTemplates = customer?.gender
    ? (templates ?? []).filter((tpl) => tpl.gender === "any" || tpl.gender === customer.gender)
    : (templates ?? []);

  const templateValues = Array.isArray(c.template_values)
    ? /** @type {unknown[]} */ (c.template_values)
        .filter(
          /** @returns {v is { label: unknown, value: unknown }} */
          (v) => !!v && typeof v === "object",
        )
        .map((v) => ({ label: String(v.label ?? ""), value: String(v.value ?? "") }))
    : [];

  const templateOptions = applicableTemplates.map((tpl) => ({
    id: tpl.id,
    name: tpl.name,
    labels: fieldsJsonToLabels(tpl.fields),
  }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            {c.queue_number != null && (
              <span className="text-foreground text-2xl font-bold tabular-nums">
                #{c.queue_number}
              </span>
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
            <Link
              href={`/checkups/${c.id}/prescription`}
              locale={/** @type {"vi" | "en"} */ (locale)}
            >
              {tBilling("title")}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/checkups/${c.id}/imaging`} locale={/** @type {"vi" | "en"} */ (locale)}>
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
        templates={templateOptions}
        initialTemplateId={c.template_id}
        initialTemplateValues={templateValues}
        diagnosisSuggestions={diagnosisSuggestions}
      />
      <p className="sr-only">{t("title")}</p>
    </div>
  );
}
