/**
 * Patient roster Excel export — Node-runtime Route Handler. Admin/cashier
 * only. Exports every non-deleted customer with resolved province/ward names.
 * Route handlers don't inherit layout gates, so the role check is done here
 * explicitly.
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
  const tPatients = await getTranslations("patients");

  const { data: customers } = await supabase
    .from("customers")
    .select("id, last_name, first_name, dob, gender, phone, cccd, province_code, ward_code, address_detail, created_at")
    .eq("deleted", false)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  const rows = customers ?? [];
  const provinceCodes = [...new Set(rows.map((r) => r.province_code).filter((v): v is string => v != null))];
  const wardCodes = [...new Set(rows.map((r) => r.ward_code).filter((v): v is string => v != null))];

  const [{ data: provinces }, { data: wards }] = await Promise.all([
    provinceCodes.length
      ? supabase.from("provinces").select("code, name").in("code", provinceCodes)
      : Promise.resolve({ data: [] as { code: string; name: string }[] }),
    wardCodes.length
      ? supabase.from("wards").select("code, name").in("code", wardCodes)
      : Promise.resolve({ data: [] as { code: string; name: string }[] }),
  ]);

  const provinceName = new Map((provinces ?? []).map((p) => [p.code, p.name]));
  const wardName = new Map((wards ?? []).map((w) => [w.code, w.name]));

  const sheetRows = rows.map((r) => ({
    [t("patient")]: `${r.last_name} ${r.first_name}`,
    [tPatients("dob")]: r.dob ?? "",
    [t("gender")]: r.gender ? tPatients(`gender.${r.gender}`) : "",
    [tPatients("phone")]: r.phone ?? "",
    [tPatients("cccd")]: r.cccd ?? "",
    [t("address")]: [r.address_detail, r.ward_code ? (wardName.get(r.ward_code) ?? "") : "", r.province_code ? (provinceName.get(r.province_code) ?? "") : ""]
      .filter(Boolean)
      .join(", "),
    [t("createdAt")]: r.created_at.slice(0, 10),
  }));

  const ws = XLSX.utils.json_to_sheet(sheetRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Patients");
  const buffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="patients-${today}.xlsx"`,
    },
  });
}
