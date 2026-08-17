import Link from "next/link";
import { routing } from "@/i18n/routing";

// Outside-locale fallback (URL didn't match any locale segment). Renders
// without locale context, so messages are hardcoded in both languages.
export default function GlobalNotFound() {
  return (
    <html lang={routing.defaultLocale}>
      <body>
        <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6 py-16">
          <h1 className="text-2xl font-semibold">404</h1>
          <p>Không tìm thấy trang. / Page not found.</p>
          <Link href={`/${routing.defaultLocale}`} className="underline">
            Về trang chủ / Go home
          </Link>
        </main>
      </body>
    </html>
  );
}
