"use server";

/**
 * Clinic-settings Server Action (admin only). Upserts the singleton row via the
 * caller's user client (RLS admin policy is the gate), audit-logs, revalidates.
 * Empty strings are stored as NULL.
 */

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { getServerSession } from "@/lib/auth/get-server-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ClinicSettingsSchema,
  type ClinicSettingsState,
} from "@/lib/clinic/clinic-settings-schema";

const emptyToNull = (s: string) => (s.length > 0 ? s : null);

export async function updateClinicSettingsAction(
  _prev: ClinicSettingsState,
  formData: FormData,
): Promise<ClinicSettingsState> {
  const t = await getTranslations("admin.settings");

  const session = await getServerSession();
  if (session?.role !== "admin") {
    return { status: "error", fieldErrors: {}, formError: t("errorForbidden") };
  }

  const parsed = ClinicSettingsSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address"),
    phone: formData.get("phone"),
    prefix: formData.get("prefix"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      formError: null,
    };
  }

  const { name, address, phone, prefix } = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("clinic_settings").upsert(
    {
      id: true,
      name: emptyToNull(name),
      address: emptyToNull(address),
      phone: emptyToNull(phone),
      prefix: emptyToNull(prefix),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) {
    return { status: "error", fieldErrors: {}, formError: t("errorGeneric") };
  }

  await supabase.rpc("log_audit", {
    p_action: "clinic_settings.update",
    p_entity: "clinic_settings",
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/settings`);
  return { status: "success" };
}
