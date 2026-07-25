// WARNING: Do NOT add `'use cache'` — reads cookies() via the server client.

import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { deactivateMedicineAction } from "./actions";

const vnd = (n: number) => `${new Intl.NumberFormat("vi-VN").format(n)} ₫`;

export default async function MedicinesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("admin.medicines");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("medicines")
    .select("id, name, unit, sale_price")
    .eq("deleted", false)
    .order("name");
  const rows = data ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-foreground text-xl font-semibold">{t("title")}</h1>
        <Button asChild size="lg">
          <Link href="/admin/medicines/new" locale={locale as "vi" | "en"}>
            {t("new")}
          </Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <ul className="divide-border divide-y">
          {rows.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-foreground truncate font-medium">{m.name}</p>
                <p className="text-muted-foreground text-xs">
                  {[m.unit, vnd(m.sale_price)].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button asChild variant="outline">
                  <Link href={`/admin/medicines/${m.id}/edit`} locale={locale as "vi" | "en"}>
                    {t("edit")}
                  </Link>
                </Button>
                <form action={deactivateMedicineAction}>
                  <input type="hidden" name="id" value={m.id} />
                  <Button type="submit" variant="ghost" className="text-destructive">
                    {t("deactivate")}
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
