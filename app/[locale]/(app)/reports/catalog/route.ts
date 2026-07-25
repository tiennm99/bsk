/**
 * Catalog Excel export — Node-runtime Route Handler. Admin/cashier only.
 * Exports the active medicine and service catalogs as two sheets in one
 * workbook. Route handlers don't inherit layout gates, so the role check is
 * done here explicitly.
 */

import * as XLSX from "xlsx";
import { getTranslations } from "next-intl/server";
import { getServerSession } from "@/lib/auth/get-server-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession();
  if (session?.role !== "admin" && session?.role !== "cashier") {
    return new Response("Forbidden", { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  const t = await getTranslations("reports");
  const tMedicines = await getTranslations("admin.medicines");
  const tServices = await getTranslations("admin.services");

  const [{ data: medicines }, { data: services }] = await Promise.all([
    supabase
      .from("medicines")
      .select("name, unit, sale_price, cost_price, company, route")
      .eq("deleted", false)
      .order("name", { ascending: true }),
    supabase
      .from("services")
      .select("name, price")
      .eq("deleted", false)
      .order("name", { ascending: true }),
  ]);

  const medicineRows = (medicines ?? []).map((m) => ({
    [tMedicines("name")]: m.name,
    [tMedicines("unit")]: m.unit ?? "",
    [tMedicines("salePrice")]: m.sale_price,
    [tMedicines("costPrice")]: m.cost_price ?? 0,
    [tMedicines("company")]: m.company ?? "",
    [tMedicines("route")]: m.route ?? "",
  }));
  const serviceRows = (services ?? []).map((s) => ({
    [tServices("name")]: s.name,
    [tServices("price")]: s.price,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(medicineRows), t("medicinesSheet"));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(serviceRows), t("servicesSheet"));
  const buffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(
    new Date(),
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="catalog-${today}.xlsx"`,
    },
  });
}
