// WARNING: Do NOT add `'use cache'` — reads cookies() via the server client.

import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddServiceForm } from "./add-service-form";
import { updateServiceAction, deactivateServiceAction } from "./actions";

/**
 * @param {{ params: Promise<{ locale: string }> }} props
 * @returns {Promise<import("react").JSX.Element>}
 */
export default async function ServicesPage({ params }) {
  await params;
  const t = await getTranslations("admin.services");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("services")
    .select("id, name, price")
    .eq("deleted", false)
    .order("name");
  const rows = data ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-foreground mb-6 text-xl font-semibold">{t("title")}</h1>

      <section className="border-border mb-8 rounded-lg border p-4">
        <h2 className="text-foreground mb-3 text-sm font-medium">{t("addTitle")}</h2>
        <AddServiceForm />
      </section>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((s) => (
            <li
              key={s.id}
              className="border-border flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-end"
            >
              <form
                action={updateServiceAction}
                className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end"
              >
                <input type="hidden" name="id" value={s.id} />
                <div className="flex-1 space-y-1">
                  <label htmlFor={`sn-${s.id}`} className="text-muted-foreground text-xs">
                    {t("name")}
                  </label>
                  <Input id={`sn-${s.id}`} name="name" defaultValue={s.name} required />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`sp-${s.id}`} className="text-muted-foreground text-xs">
                    {t("price")}
                  </label>
                  <Input
                    id={`sp-${s.id}`}
                    name="price"
                    type="number"
                    min={0}
                    defaultValue={s.price}
                  />
                </div>
                <Button type="submit" variant="outline">
                  {t("save")}
                </Button>
              </form>
              <form action={deactivateServiceAction}>
                <input type="hidden" name="id" value={s.id} />
                <Button type="submit" variant="ghost" className="text-destructive">
                  {t("deactivate")}
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
