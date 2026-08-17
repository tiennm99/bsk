// WARNING: Do NOT add `'use cache'` — reads cookies() via the server client.

/**
 * Checkup templates — Server Component (admin only; gated by (app)/admin layout).
 */

import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { deactivateTemplateAction } from "./actions";

export default async function TemplatesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("admin.templates");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("checkup_templates")
    .select("id, name, gender")
    .eq("deleted", false)
    .order("name", { ascending: true });
  const templates = data ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-foreground text-xl font-semibold">{t("title")}</h1>
        <Button asChild size="lg">
          <Link href="/admin/templates/new" locale={locale as "vi" | "en"}>
            {t("new")}
          </Link>
        </Button>
      </div>

      {templates.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <ul className="divide-border divide-y">
          {templates.map((tpl) => (
            <li key={tpl.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-foreground truncate font-medium">{tpl.name}</p>
                <p className="text-muted-foreground text-xs">{t(`genders.${tpl.gender}`)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button asChild variant="outline">
                  <Link href={`/admin/templates/${tpl.id}/edit`} locale={locale as "vi" | "en"}>
                    {t("edit")}
                  </Link>
                </Button>
                <form action={deactivateTemplateAction}>
                  <input type="hidden" name="id" value={tpl.id} />
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
