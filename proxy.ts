import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { updateSupabaseSession, PROTECTED_PATH_PREFIXES } from "@/lib/supabase/session";
import { copyCookies } from "@/lib/proxy/copy-cookies";

/**
 * Built once at module load — not per request.
 * next-intl composition pattern: call createMiddleware() here, then invoke the
 * returned function inside proxy() with the actual request.
 * Ref: next-intl docs "Usage without framework integration".
 */
const handleI18nRouting = createMiddleware(routing);

/**
 * Returns true when the path (locale-stripped) starts with a protected prefix.
 * Input: raw pathname from NextRequest (e.g. "/vi/dashboard/patients").
 * Strips the leading locale segment before comparing so "/vi/dashboard" and
 * "/en/dashboard" both match "/dashboard".
 */
function isProtectedPath(pathname: string): boolean {
  // Remove a leading locale segment if present (e.g. "/vi" or "/en").
  const localeSegmentRe = new RegExp(`^\\/(${routing.locales.join("|")})(\\/.*)?(\\?.*)?$`);
  const match = localeSegmentRe.exec(pathname);
  // After stripping: "/vi/dashboard" → "/dashboard"; "/dashboard" stays as-is.
  const stripped = match ? (match[2] ?? "/") : pathname;

  return PROTECTED_PATH_PREFIXES.some((prefix) => stripped.startsWith(prefix));
}

/**
 * Unified middleware entry point.
 *
 * Request flow:
 *  1. Run Supabase session refresh → writes refreshed sb-* cookies onto BOTH
 *     request.cookies (for downstream reads) and a NextResponse (for Set-Cookie).
 *  2. Coarse auth gate: unauthenticated requests to protected paths get a 307
 *     redirect to /${locale}/sign-in?next=<original-path>.
 *     Supabase cookies are copied onto the redirect response so the browser
 *     receives the token delta even on redirect.
 *  3. Hand off to next-intl for locale detection / prefix rewrites.
 *     • If next-intl produces a redirect/rewrite (status !== 200 OR x-middleware-rewrite
 *       header present), copy Supabase cookies onto it and return it.
 *     • Otherwise return the Supabase response directly (cookies already attached).
 *
 * Single response guarantee: only one NextResponse is ever returned per
 * request. Cookie sets from both layers are always merged before returning.
 * Two competing responses would silently drop one set of Set-Cookie headers,
 * appearing as a sign-out on the next request.
 *
 * NOTE: No `export const runtime = 'edge'` — proxy runs on the Node.js runtime
 * in Next.js 16+. Supabase SSR is not certified for the Edge runtime.
 */
export default async function proxy(request: NextRequest): Promise<NextResponse> {
  // ── Step 1: Supabase session refresh ─────────────────────────────────────
  const { response: supabaseResponse, user } = await updateSupabaseSession(request);

  // ── Step 2: Coarse protected-path gate ───────────────────────────────────
  // Always redirects to `/${locale}/sign-in` with NO `?next=` param —
  // the trimmed plan dropped post-login redirect plumbing (original BSK has no
  // URL deep-linking surface; signInAction always lands users on /dashboard).
  if (!user && isProtectedPath(request.nextUrl.pathname)) {
    const locale =
      routing.locales.find((l) => request.nextUrl.pathname.startsWith(`/${l}`)) ??
      routing.defaultLocale;

    const signInUrl = new URL(`/${locale}/sign-in`, request.url);

    const redirectResponse = NextResponse.redirect(signInUrl, { status: 307 });
    // Port Supabase cookie deltas onto the redirect so the browser stores them.
    copyCookies(supabaseResponse, redirectResponse);
    return redirectResponse;
  }

  // ── Step 3: next-intl locale routing ─────────────────────────────────────
  const intlResponse = handleI18nRouting(request);

  // next-intl produced a redirect (3xx) or a rewrite (x-middleware-rewrite header).
  // In both cases it is a distinct NextResponse — merge Supabase cookies onto it.
  const isRedirect = intlResponse.status >= 300 && intlResponse.status < 400;
  const isRewrite = intlResponse.headers.has("x-middleware-rewrite");

  if (isRedirect || isRewrite) {
    copyCookies(supabaseResponse, intlResponse);
    return intlResponse;
  }

  // next-intl returned a plain next() response — the Supabase response already
  // carries the correct cookies (and the request rewrites from step 1).
  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
