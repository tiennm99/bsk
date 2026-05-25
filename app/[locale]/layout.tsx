// WARNING: Do NOT add `'use cache'` to this layout — it calls
// createSupabaseServerClient() which reads cookies(). Caching this scope would
// either throw at build time or serve stale auth state across users.
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { routing } from "@/i18n/routing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SessionProvider } from "@/lib/auth/session-provider";
import { Toaster } from "@/components/ui/sonner";
import "../globals.css";

export const metadata: Metadata = {
  title: "BSK Clinic",
  description: "Educational clinic management rewrite",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  // Read the authenticated user here, outside any `'use cache'` scope.
  // getUser() validates the JWT server-side on every render — do not move this
  // call into a cached helper. Cached helpers that need the user receive it as
  // a function argument (see phase 06 patterns).
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // user is null when unauthenticated or when Supabase Auth is unreachable.
  // No redirect here — route gating is phase 06's responsibility.
  // The proxy already handles the coarse "unauth → /sign-in" redirect for
  // explicitly protected path prefixes (/dashboard, /admin).

  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <NextIntlClientProvider>
          {/* Toaster is mounted once globally here so toast() calls from any
              client component in the subtree are rendered. Position: top-right
              keeps it out of the form's field error region. */}
          <Toaster richColors position="top-right" />
          {/* SessionProvider makes `user` available to client components via
              useSession() without any additional Supabase calls from the client. */}
          <SessionProvider user={user}>{children}</SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
