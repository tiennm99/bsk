import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // Required per next-intl static-rendering guide; intentionally duplicated
  // alongside the same call in `[locale]/layout.tsx`. Do not remove.
  setRequestLocale(locale);

  const t = await getTranslations("home");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("subtitle")}</p>
      <p className="text-muted-foreground text-sm">{t("status", { phase: "0" })}</p>
    </main>
  );
}
