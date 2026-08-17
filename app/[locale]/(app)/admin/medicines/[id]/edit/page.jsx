import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MedicineForm } from "../../medicine-form";
import { updateMedicineAction } from "../../actions";

export default async function EditMedicinePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("admin.medicines");
  const medId = Number(id);
  if (!Number.isFinite(medId)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: m } = await supabase
    .from("medicines")
    .select("id, name, unit, sale_price, cost_price, company, route")
    .eq("id", medId)
    .eq("deleted", false)
    .maybeSingle();
  if (!m) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-foreground mb-6 text-xl font-semibold">
        {t("editTitle", { name: m.name })}
      </h1>
      <MedicineForm
        mode="edit"
        action={updateMedicineAction}
        defaults={{
          id: m.id,
          name: m.name,
          unit: m.unit ?? "",
          salePrice: String(m.sale_price),
          costPrice: m.cost_price != null ? String(m.cost_price) : "",
          company: m.company ?? "",
          route: m.route ?? "",
        }}
      />
    </div>
  );
}
