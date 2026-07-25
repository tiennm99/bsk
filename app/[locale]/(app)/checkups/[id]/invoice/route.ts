/**
 * Invoice PDF — Node-runtime Route Handler. Renders a Vietnamese-capable PDF
 * (Be Vietnam Pro) of a checkup's medicines + services + grand total + payment
 * status. Enrolled staff only. Totals summed server-side from stored line_total.
 */

import { getTranslations } from "next-intl/server";
import { getServerSession } from "@/lib/auth/get-server-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { renderInvoicePdf, type InvoiceLine } from "@/lib/pdf/invoice-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string; id: string }> }) {
  const { id } = await params;
  const checkupId = Number(id);
  if (!Number.isFinite(checkupId)) return new Response("Not found", { status: 404 });

  const session = await getServerSession();
  if (!session?.role) return new Response("Forbidden", { status: 403 });

  const supabase = await createSupabaseServerClient();

  const [{ data: c }, { data: clinic }] = await Promise.all([
    supabase
      .from("checkups")
      .select("id, customer_id, queue_number, checkup_date")
      .eq("id", checkupId)
      .eq("deleted", false)
      .maybeSingle(),
    supabase.from("clinic_settings").select("name, address, phone").eq("id", true).maybeSingle(),
  ]);
  if (!c) return new Response("Not found", { status: 404 });

  const [{ data: customer }, { data: items }, { data: svcs }, { data: order }] = await Promise.all([
    supabase.from("customers").select("last_name, first_name").eq("id", c.customer_id).maybeSingle(),
    supabase.from("order_items").select("medicine_id, quantity, unit_price, line_total").eq("checkup_id", checkupId),
    supabase.from("checkup_services").select("service_id, quantity, unit_price, line_total").eq("checkup_id", checkupId),
    supabase.from("medicine_orders").select("payment_status").eq("checkup_id", checkupId).maybeSingle(),
  ]);

  const medIds = [...new Set((items ?? []).map((i) => i.medicine_id))];
  const svcIds = [...new Set((svcs ?? []).map((x) => x.service_id))];
  const { data: meds } = medIds.length
    ? await supabase.from("medicines").select("id, name").in("id", medIds)
    : { data: [] };
  const { data: services } = svcIds.length
    ? await supabase.from("services").select("id, name").in("id", svcIds)
    : { data: [] };
  const medName = new Map((meds ?? []).map((m) => [m.id, m.name]));
  const svcName = new Map((services ?? []).map((x) => [x.id, x.name]));

  const medicines: InvoiceLine[] = (items ?? []).map((i) => ({
    name: medName.get(i.medicine_id) ?? "—",
    quantity: i.quantity,
    unitPrice: i.unit_price,
    lineTotal: i.line_total,
  }));
  const serviceLines: InvoiceLine[] = (svcs ?? []).map((x) => ({
    name: svcName.get(x.service_id) ?? "—",
    quantity: x.quantity,
    unitPrice: x.unit_price,
    lineTotal: x.line_total,
  }));
  const total = [...medicines, ...serviceLines].reduce((sum, l) => sum + l.lineTotal, 0);

  const t = await getTranslations("reports");
  const buffer = await renderInvoicePdf({
    clinicName: clinic?.name ?? "",
    clinicAddress: clinic?.address ?? "",
    clinicPhone: clinic?.phone ?? "",
    patientName: customer ? `${customer.last_name} ${customer.first_name}` : "—",
    date: c.checkup_date,
    queueNumber: c.queue_number,
    medicines,
    services: serviceLines,
    total,
    paid: order?.payment_status === "paid",
    labels: {
      invoice: t("invoice"),
      patient: t("patient"),
      date: t("date"),
      queue: t("queue"),
      medicines: t("medicines"),
      services: t("services"),
      item: t("item"),
      qty: t("qty"),
      unitPrice: t("unitPrice"),
      lineTotal: t("lineTotal"),
      total: t("total"),
      paid: t("paid"),
      unpaid: t("unpaid"),
    },
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${checkupId}.pdf"`,
    },
  });
}
