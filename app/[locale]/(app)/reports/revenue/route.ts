/**
 * Revenue Excel export — Node-runtime Route Handler. Admin/cashier only.
 * Exports one row per PAID checkup in a month (default: current VN month)
 * with medicine/service subtotals, grand total, and payment method, plus a
 * final TOTAL row. Route handlers don't inherit layout gates, so the role
 * check is done here explicitly.
 */

import * as XLSX from "xlsx";
import { getTranslations } from "next-intl/server";
import { getServerSession } from "@/lib/auth/get-server-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONTH_RE = /^\d{4}-\d{2}$/;

function monthRange(month: string): { start: string; end: string } {
  const parts = month.split("-");
  const y = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 1);
  const start = `${month}-01`;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
  return { start, end };
}

export async function GET(req: Request) {
  const session = await getServerSession();
  if (session?.role !== "admin" && session?.role !== "cashier") {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const monthParam = url.searchParams.get("month");
  const month =
    monthParam && MONTH_RE.test(monthParam)
      ? monthParam
      : new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Ho_Chi_Minh",
          year: "numeric",
          month: "2-digit",
        })
          .format(new Date())
          .slice(0, 7);
  const { start, end } = monthRange(month);

  const supabase = await createSupabaseServerClient();
  const t = await getTranslations("reports");
  const tBilling = await getTranslations("billing");

  const { data: checkups } = await supabase
    .from("checkups")
    .select("id, customer_id, checkup_date")
    .gte("checkup_date", start)
    .lt("checkup_date", end)
    .eq("deleted", false)
    .order("checkup_date", { ascending: true });

  const rows = checkups ?? [];
  const ids = rows.map((r) => r.id);

  const { data: orders } = ids.length
    ? await supabase
        .from("medicine_orders")
        .select("checkup_id, payment_status, payment_method")
        .in("checkup_id", ids)
        .eq("payment_status", "paid")
    : {
        data: [] as { checkup_id: number; payment_status: string; payment_method: string | null }[],
      };

  const paidIds = new Set((orders ?? []).map((o) => o.checkup_id));
  const paidRows = rows.filter((r) => paidIds.has(r.id));
  const paidCheckupIds = paidRows.map((r) => r.id);
  const methodByCheckup = new Map((orders ?? []).map((o) => [o.checkup_id, o.payment_method]));

  const custIds = [...new Set(paidRows.map((r) => r.customer_id))];
  const [{ data: custs }, { data: items }, { data: svcs }] = await Promise.all([
    custIds.length
      ? supabase.from("customers").select("id, last_name, first_name").in("id", custIds)
      : Promise.resolve({ data: [] as { id: number; last_name: string; first_name: string }[] }),
    paidCheckupIds.length
      ? supabase
          .from("order_items")
          .select("checkup_id, line_total")
          .in("checkup_id", paidCheckupIds)
      : Promise.resolve({ data: [] as { checkup_id: number; line_total: number }[] }),
    paidCheckupIds.length
      ? supabase
          .from("checkup_services")
          .select("checkup_id, line_total")
          .in("checkup_id", paidCheckupIds)
      : Promise.resolve({ data: [] as { checkup_id: number; line_total: number }[] }),
  ]);

  const name = new Map((custs ?? []).map((c) => [c.id, `${c.last_name} ${c.first_name}`]));
  const medSubtotalBy = new Map<number, number>();
  for (const it of items ?? []) {
    medSubtotalBy.set(it.checkup_id, (medSubtotalBy.get(it.checkup_id) ?? 0) + it.line_total);
  }
  const svcSubtotalBy = new Map<number, number>();
  for (const sv of svcs ?? []) {
    svcSubtotalBy.set(sv.checkup_id, (svcSubtotalBy.get(sv.checkup_id) ?? 0) + sv.line_total);
  }

  const KNOWN_METHODS = ["cash", "card", "transfer"] as const;
  const methodLabel = (method: string | null) => {
    if (!method) return "";
    return (KNOWN_METHODS as readonly string[]).includes(method)
      ? tBilling(`method.${method}`)
      : method;
  };

  type RevenueRow = Record<string, string | number>;

  let grandTotal = 0;
  const sheetRows: RevenueRow[] = paidRows.map((r) => {
    const medSubtotal = medSubtotalBy.get(r.id) ?? 0;
    const svcSubtotal = svcSubtotalBy.get(r.id) ?? 0;
    const total = medSubtotal + svcSubtotal;
    grandTotal += total;
    return {
      [t("date")]: r.checkup_date,
      [t("patient")]: name.get(r.customer_id) ?? "",
      [t("medicines")]: medSubtotal,
      [t("services")]: svcSubtotal,
      [t("total")]: total,
      [t("paymentMethod")]: methodLabel(methodByCheckup.get(r.id) ?? null),
    };
  });

  sheetRows.push({
    [t("date")]: "",
    [t("patient")]: t("grandTotal"),
    [t("medicines")]: "",
    [t("services")]: "",
    [t("total")]: grandTotal,
    [t("paymentMethod")]: "",
  });

  const ws = XLSX.utils.json_to_sheet(sheetRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Revenue");
  const buffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="revenue-${month}.xlsx"`,
    },
  });
}
