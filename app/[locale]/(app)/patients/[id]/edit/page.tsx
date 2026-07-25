// WARNING: Do NOT add `'use cache'` — reads cookies() via the server client.

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PatientForm } from "../../patient-form";
import { updateCustomerAction } from "../../actions";

export default async function EditPatientPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("patients");
  const customerId = Number(id);
  if (!Number.isFinite(customerId)) notFound();

  const supabase = await createSupabaseServerClient();

  const [{ data: customer }, { data: provinces }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, first_name, last_name, dob, gender, phone, cccd, province_code, ward_code, address_detail")
      .eq("id", customerId)
      .eq("deleted", false)
      .maybeSingle(),
    supabase.from("provinces").select("code, name").order("name"),
  ]);

  if (!customer) notFound();

  const { data: wards } = customer.province_code
    ? await supabase
        .from("wards")
        .select("code, name")
        .eq("province_code", customer.province_code)
        .order("name")
    : { data: [] };

  const defaults = {
    id: customer.id,
    lastName: customer.last_name,
    firstName: customer.first_name,
    dob: customer.dob ?? "",
    gender: customer.gender ?? "",
    phone: customer.phone ?? "",
    cccd: customer.cccd ?? "",
    provinceCode: customer.province_code ?? "",
    wardCode: customer.ward_code ?? "",
    addressDetail: customer.address_detail ?? "",
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-foreground mb-6 text-xl font-semibold">
        {t("editTitle", { name: `${customer.last_name} ${customer.first_name}` })}
      </h1>
      <PatientForm
        mode="edit"
        action={updateCustomerAction}
        provinces={provinces ?? []}
        initialWards={wards ?? []}
        defaults={defaults}
      />
    </div>
  );
}
