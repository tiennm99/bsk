// WARNING: Do NOT add `'use cache'` — reads cookies() via the server client.

/**
 * Doctor management — Server Component (admin only; gated by (app)/admin layout).
 *
 * Lists active doctors and renders inline edit + deactivate forms bound to
 * Server Actions. Reads run under the caller's RLS (doctors_select_enrolled).
 */

import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddDoctorForm } from "./add-doctor-form";
import { updateDoctorAction, deactivateDoctorAction } from "./actions";

export default async function DoctorsPage({ params }: { params: Promise<{ locale: string }> }) {
  await params; // Next.js 16: params is async.
  const t = await getTranslations("admin.doctors");

  const supabase = await createSupabaseServerClient();
  const { data: doctors } = await supabase
    .from("doctors")
    .select("id, first_name, last_name")
    .eq("deleted", false)
    .order("last_name", { ascending: true });

  const rows = doctors ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-foreground mb-6 text-xl font-semibold">{t("title")}</h1>

      <section className="border-border mb-8 rounded-lg border p-4">
        <h2 className="text-foreground mb-3 text-sm font-medium">{t("addTitle")}</h2>
        <AddDoctorForm />
      </section>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <ul className="space-y-2" aria-label={t("title")}>
          {rows.map((d) => (
            <li
              key={d.id}
              className="border-border flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-end"
            >
              <form
                action={updateDoctorAction}
                className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end"
              >
                <input type="hidden" name="id" value={d.id} />
                <div className="flex-1 space-y-1">
                  <label htmlFor={`ln-${d.id}`} className="text-muted-foreground text-xs">
                    {t("lastName")}
                  </label>
                  <Input id={`ln-${d.id}`} name="lastName" defaultValue={d.last_name} required />
                </div>
                <div className="flex-1 space-y-1">
                  <label htmlFor={`fn-${d.id}`} className="text-muted-foreground text-xs">
                    {t("firstName")}
                  </label>
                  <Input id={`fn-${d.id}`} name="firstName" defaultValue={d.first_name} required />
                </div>
                <Button type="submit" variant="outline">
                  {t("save")}
                </Button>
              </form>
              <form action={deactivateDoctorAction}>
                <input type="hidden" name="id" value={d.id} />
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
