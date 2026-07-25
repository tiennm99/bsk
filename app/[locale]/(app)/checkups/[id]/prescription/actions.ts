"use server";

/**
 * Prescription/service composer + payment Server Actions for a checkup.
 * Clinical roles (admin/receptionist/doctor/nurse) compose medicine + service
 * lines — the save_prescription / save_checkup_services RPCs recompute
 * unit_price/line_total server-side from the catalogs (client totals are a
 * preview only). Admin/cashier mark the checkup's invoice paid via the
 * mark_order_paid RPC. RLS + the RPCs' internal role checks are the real
 * gate; getServerSession() here is defense-in-depth.
 */

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { redirect } from "@/i18n/navigation";
import { getServerSession } from "@/lib/auth/get-server-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/db/roles";
import {
  MedicineLinesSchema,
  ServiceLinesSchema,
  MarkPaidSchema,
  type PrescriptionSaveState,
  type MarkPaidState,
} from "@/lib/billing/prescription-schema";

const CLINICAL: AppRole[] = ["admin", "receptionist", "doctor", "nurse"];
const BILLING: AppRole[] = ["admin", "cashier"];
const isClinical = (r: AppRole | null | undefined) => !!r && CLINICAL.includes(r);
const isBilling = (r: AppRole | null | undefined) => !!r && BILLING.includes(r);

/** Parses a JSON-array form field; returns [] on any malformed input. */
function parseJsonArray(raw: FormDataEntryValue | null): unknown[] {
  if (typeof raw !== "string") return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function savePrescriptionAction(
  _prev: PrescriptionSaveState,
  formData: FormData,
): Promise<PrescriptionSaveState> {
  const t = await getTranslations("billing");

  const session = await getServerSession();
  if (!isClinical(session?.role)) {
    return { status: "error", formError: t("errorForbidden") };
  }

  const checkupId = Number(formData.get("checkupId"));
  if (!Number.isFinite(checkupId)) {
    return { status: "error", formError: t("errorGeneric") };
  }

  const medicineParsed = MedicineLinesSchema.safeParse(parseJsonArray(formData.get("medicineLines")));
  const serviceParsed = ServiceLinesSchema.safeParse(parseJsonArray(formData.get("serviceLines")));
  if (!medicineParsed.success || !serviceParsed.success) {
    return { status: "error", formError: t("errorGeneric") };
  }

  const supabase = await createSupabaseServerClient();

  const { error: medError } = await supabase.rpc("save_prescription", {
    p_checkup_id: checkupId,
    p_items: medicineParsed.data.map((l) => ({
      medicine_id: l.medicineId,
      quantity: l.quantity,
      dosage: l.dosage || null,
      notes: l.notes || null,
    })),
  });
  if (medError) return { status: "error", formError: t("errorGeneric") };

  const { error: svcError } = await supabase.rpc("save_checkup_services", {
    p_checkup_id: checkupId,
    p_items: serviceParsed.data.map((l) => ({ service_id: l.serviceId, quantity: l.quantity })),
  });
  if (svcError) return { status: "error", formError: t("errorGeneric") };

  await supabase.rpc("log_audit", {
    p_action: "prescription.save",
    p_entity: "checkups",
    p_entity_id: String(checkupId),
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/checkups/${checkupId}`);
  return redirect({ href: `/${locale}/checkups/${checkupId}`, locale });
}

export async function markPaidAction(
  _prev: MarkPaidState,
  formData: FormData,
): Promise<MarkPaidState> {
  const t = await getTranslations("billing");

  const session = await getServerSession();
  if (!isBilling(session?.role)) {
    return { status: "error", formError: t("errorForbidden") };
  }

  const checkupId = Number(formData.get("checkupId"));
  const parsed = MarkPaidSchema.safeParse({ method: formData.get("method") });
  if (!Number.isFinite(checkupId) || !parsed.success) {
    return { status: "error", formError: t("errorGeneric") };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_order_paid", {
    p_checkup_id: checkupId,
    p_method: parsed.data.method,
  });
  if (error) return { status: "error", formError: t("errorGeneric") };

  await supabase.rpc("log_audit", {
    p_action: "invoice.pay",
    p_entity: "checkups",
    p_entity_id: String(checkupId),
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/checkups/${checkupId}/prescription`);
  revalidatePath(`/${locale}/checkups/${checkupId}`);
  return { status: "success" };
}
