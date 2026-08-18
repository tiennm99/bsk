// WARNING: Do NOT add `'use cache'` — reads cookies() via the server client.

import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PatientForm } from "../patient-form";
import { createCustomerAction } from "../actions";

const BLANK = {
  lastName: "",
  firstName: "",
  dob: "",
  gender: "",
  phone: "",
  cccd: "",
  provinceCode: "",
  wardCode: "",
  addressDetail: "",
};

/**
 * @param {{ params: Promise<{ locale: string }> }} props
 * @returns {Promise<import("react").JSX.Element>}
 */
export default async function NewPatientPage({ params }) {
  await params;
  const t = await getTranslations("patients");

  const supabase = await createSupabaseServerClient();
  const { data: provinces } = await supabase.from("provinces").select("code, name").order("name");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-foreground mb-6 text-xl font-semibold">{t("newTitle")}</h1>
      <PatientForm
        mode="create"
        action={createCustomerAction}
        provinces={provinces ?? []}
        initialWards={[]}
        defaults={BLANK}
      />
    </div>
  );
}
