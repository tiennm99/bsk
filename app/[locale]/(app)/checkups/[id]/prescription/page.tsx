// WARNING: Do NOT add `'use cache'` — reads cookies() via the server client.

/**
 * Prescription + service composer for a checkup. Loads the checkup, patient
 * name, active medicine/service catalogs, any existing order_items /
 * checkup_services, and the payment row — then hands everything to the
 * client composer. Gated by the checkups layout (clinical roles).
 */

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getServerSession } from "@/lib/auth/get-server-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { routing } from "@/i18n/routing";
import { PrescriptionComposer } from "./prescription-composer";

export default async function PrescriptionPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations("billing");
  const tReports = await getTranslations("reports");
  const checkupId = Number(id);
  if (!Number.isFinite(checkupId)) notFound();

  const session = await getServerSession();
  const supabase = await createSupabaseServerClient();

  const { data: checkup } = await supabase
    .from("checkups")
    .select("id, customer_id, queue_number")
    .eq("id", checkupId)
    .eq("deleted", false)
    .maybeSingle();
  if (!checkup) notFound();

  const [
    { data: customer },
    { data: medicines },
    { data: services },
    { data: orderItems },
    { data: checkupServices },
    { data: order },
  ] = await Promise.all([
    supabase
      .from("customers")
      .select("last_name, first_name")
      .eq("id", checkup.customer_id)
      .maybeSingle(),
    supabase
      .from("medicines")
      .select("id, name, unit, sale_price")
      .eq("deleted", false)
      .order("name"),
    supabase.from("services").select("id, name, price").eq("deleted", false).order("name"),
    supabase
      .from("order_items")
      .select("id, medicine_id, quantity, dosage, unit_price, line_total, notes")
      .eq("checkup_id", checkupId),
    supabase
      .from("checkup_services")
      .select("id, service_id, quantity, unit_price, line_total")
      .eq("checkup_id", checkupId),
    supabase
      .from("medicine_orders")
      .select("payment_status, payment_method, paid_at")
      .eq("checkup_id", checkupId)
      .maybeSingle(),
  ]);

  const patientName = customer ? `${customer.last_name} ${customer.first_name}` : "—";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            {checkup.queue_number != null && (
              <span className="text-foreground text-2xl font-bold tabular-nums">
                #{checkup.queue_number}
              </span>
            )}
            <h1 className="text-foreground text-xl font-semibold">{patientName}</h1>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">{t("title")}</p>
        </div>
        <div className="flex gap-2" data-print-hidden>
          <Button asChild variant="outline">
            <a
              href={`${locale === routing.defaultLocale ? "" : `/${locale}`}/checkups/${checkup.id}/prescription/pdf`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {tReports("printPrescription")}
            </a>
          </Button>
          <Button asChild variant="outline">
            <a
              href={`${locale === routing.defaultLocale ? "" : `/${locale}`}/checkups/${checkup.id}/invoice`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {tReports("printInvoice")}
            </a>
          </Button>
        </div>
      </div>

      <PrescriptionComposer
        checkupId={checkup.id}
        medicines={medicines ?? []}
        services={services ?? []}
        initialMedicineLines={(orderItems ?? []).map((o) => ({
          medicineId: o.medicine_id,
          quantity: o.quantity,
          dosage: o.dosage ?? "",
          notes: o.notes ?? "",
        }))}
        initialServiceLines={(checkupServices ?? []).map((s) => ({
          serviceId: s.service_id,
          quantity: s.quantity,
        }))}
        payment={
          order
            ? { status: order.payment_status, method: order.payment_method, paidAt: order.paid_at }
            : { status: "unpaid", method: null, paidAt: null }
        }
        canMarkPaid={session?.role === "admin" || session?.role === "cashier"}
      />
    </div>
  );
}
