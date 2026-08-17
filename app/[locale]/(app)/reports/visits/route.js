/**
 * Visits Excel export — Node-runtime Route Handler. Admin/cashier only.
 * Exports a month's checkups (default: current VN month) with per-visit invoice
 * totals + payment status. Route handlers don't inherit layout gates, so the
 * role check is done here explicitly.
 */

import * as XLSX from "xlsx";
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

  const { data: checkups } = await supabase
    .from("checkups")
    .select("id, customer_id, queue_number, checkup_date, diagnosis")
    .gte("checkup_date", start)
    .lt("checkup_date", end)
    .eq("deleted", false)
    .order("checkup_date", { ascending: true })
    .order("queue_number", { ascending: true });

  const rows = checkups ?? [];
  const ids = rows.map((r) => r.id);
  const custIds = [...new Set(rows.map((r) => r.customer_id))];

  const [{ data: custs }, { data: items }, { data: svcs }, { data: orders }] = await Promise.all([
    custIds.length
      ? supabase.from("customers").select("id, last_name, first_name").in("id", custIds)
      : Promise.resolve({ data: [] as { id: number; last_name: string; first_name: string }[] }),
    ids.length
      ? supabase.from("order_items").select("checkup_id, line_total").in("checkup_id", ids)
      : Promise.resolve({ data: [] as { checkup_id: number; line_total: number }[] }),
    ids.length
      ? supabase.from("checkup_services").select("checkup_id, line_total").in("checkup_id", ids)
      : Promise.resolve({ data: [] as { checkup_id: number; line_total: number }[] }),
    ids.length
      ? supabase.from("medicine_orders").select("checkup_id, payment_status").in("checkup_id", ids)
      : Promise.resolve({ data: [] as { checkup_id: number; payment_status: string }[] }),
  ]);

  const name = new Map((custs ?? []).map((c) => [c.id, `${c.last_name} ${c.first_name}`]));
  const totalBy = new Map<number, number>();
  for (const it of [...(items ?? []), ...(svcs ?? [])]) {
    totalBy.set(it.checkup_id, (totalBy.get(it.checkup_id) ?? 0) + it.line_total);
  }
  const paidBy = new Map((orders ?? []).map((o) => [o.checkup_id, o.payment_status === "paid"]));

  const sheetRows = rows.map((r) => ({
    Date: r.checkup_date,
    "Queue #": r.queue_number ?? "",
    Patient: name.get(r.customer_id) ?? "",
    Diagnosis: r.diagnosis ?? "",
    "Total (VND)": totalBy.get(r.id) ?? 0,
    Paid: paidBy.get(r.id) ? "x" : "",
  }));

  const ws = XLSX.utils.json_to_sheet(sheetRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Visits");
  const buffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="visits-${month}.xlsx"`,
    },
  });
}
