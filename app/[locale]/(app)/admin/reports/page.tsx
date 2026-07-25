// WARNING: Do NOT add `'use cache'` — reads the request locale.

/** Reports — admin only (gated by the admin layout). Month → Excel export. */

import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { routing } from "@/i18n/routing";

export default async function ReportsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("reports");

  const thisMonth = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);

  const exportHref = `${locale === routing.defaultLocale ? "" : `/${locale}`}/reports/visits`;

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-foreground mb-6 text-xl font-semibold">{t("title")}</h1>

      <section className="border-border rounded-lg border p-4">
        <h2 className="text-foreground mb-3 text-sm font-medium">{t("exportVisits")}</h2>
        <form action={exportHref} method="get" target="_blank" className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="month">{t("month")}</Label>
            <Input id="month" name="month" type="month" defaultValue={thisMonth} />
          </div>
          <Button type="submit" size="lg">
            {t("download")}
          </Button>
        </form>
      </section>
    </div>
  );
}
