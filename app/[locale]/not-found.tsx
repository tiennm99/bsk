import { getTranslations } from "next-intl/server";

export default async function LocaleNotFound() {
  const t = await getTranslations("errors");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">{t("notFoundTitle")}</h1>
      <p className="text-muted-foreground">{t("notFoundBody")}</p>
    </main>
  );
}
