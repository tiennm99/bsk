import "server-only";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv, SUPABASE_SCHEMA } from "@/lib/env/server";
import type { User } from "@supabase/supabase-js";

/**
 * Coarse list of path prefixes that require authentication.
 * Checked by proxy.ts AFTER stripping the locale segment.
 * Extend here as new protected route groups are added (phases 05–06).
 * `/sign-in` is intentionally absent — it must be reachable while unauth'd.
 */
export const PROTECTED_PATH_PREFIXES: ReadonlyArray<string> = ["/dashboard", "/admin"];

/**
 * Refreshes the Supabase auth session for an incoming request.
 *
 * Call this BEFORE handing the request to `next-intl/middleware`. Merge the
 * returned `response`'s Set-Cookie headers onto whichever response next-intl
 * ultimately returns — do NOT build two independent NextResponse instances or
 * one set of cookies will be silently dropped (use `copyCookies` helper).
 *
 * Returns `{ response, user }` where `user` is `null` on auth failure or when
 * no session exists. The `response` always carries refreshed (or unchanged)
 * Supabase cookie deltas.
 *
 * Error-swallow on `getUser()` is intentional: a transient Supabase Auth
 * outage should not hard-fail every request. The caller treats `user: null` as
 * unauthenticated and applies the protected-path redirect; Supabase cookies are
 * preserved so the next request retries. (Confirmed acceptable — code-reviewer N6.)
 */
export async function updateSupabaseSession(
  request: NextRequest,
): Promise<{ response: NextResponse; user: User | null }> {
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      db: { schema: SUPABASE_SCHEMA },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            // Write onto the request so downstream middleware see the fresh token.
            request.cookies.set(name, value);
            // Write onto the response so the browser receives the refreshed cookie.
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  let user: User | null = null;

  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Transient Supabase Auth outage: keep stale cookies; next request retries.
  }

  return { response, user };
}
