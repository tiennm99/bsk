// WARNING: Do NOT add `'use cache'` — reads cookies() via the server client.

/**
 * Clinic settings — Server Component (admin only; gated by (app)/admin layout).
 * Reads the singleton row and hands its values to the client form.
 */

import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicSettingsForm } from "./clinic-settings-form";

/**
 * @param {{ params: Promise<{ locale: string }> }} props
 * @returns {Promise<import("react").JSX.Element>}
 */
export default async function ClinicSettingsPage({ params }) {
  await params; // Next.js 16: params is async.
  const t = await getTranslations("admin.settings");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("clinic_settings")
    .select("name, address, phone, prefix")
    .eq("id", true)
    .maybeSingle();

  const defaults = {
    name: data?.name ?? "",
    address: data?.address ?? "",
    phone: data?.phone ?? "",
    prefix: data?.prefix ?? "",
  };

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-foreground mb-6 text-xl font-semibold">{t("title")}</h1>
      <ClinicSettingsForm defaults={defaults} />
    </div>
  );
}
