import type { NextResponse } from "next/server";

/**
 * Copies all Set-Cookie entries from `from` onto `to`.
 *
 * Used when two middleware layers each produce a NextResponse — we must funnel
 * both sets of cookies onto the single response that is ultimately returned.
 * Specifically: Supabase session-refresh writes sb-* cookies onto a response;
 * if next-intl then produces its own redirect/rewrite response, we must port
 * the Supabase cookies onto it before returning or the auth token is lost.
 */
export function copyCookies(from: NextResponse, to: NextResponse): void {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie.name, cookie.value, cookie);
  }
}
