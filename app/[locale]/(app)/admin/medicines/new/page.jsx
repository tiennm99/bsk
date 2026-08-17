import { getTranslations } from "next-intl/server";
import { MedicineForm } from "../medicine-form";
import { createMedicineAction } from "../actions";

export default async function NewMedicinePage({ params }: { params: Promise<{ locale: string }> }) {
  await params;
  const t = await getTranslations("admin.medicines");
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-foreground mb-6 text-xl font-semibold">{t("newTitle")}</h1>
      <MedicineForm
        mode="create"
        action={createMedicineAction}
        defaults={{ name: "", unit: "", salePrice: "0", costPrice: "", company: "", route: "" }}
      />
    </div>
  );
}
