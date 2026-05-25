import "server-only";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv, SUPABASE_SCHEMA } from "@/lib/env/server";

/**
 * Refreshes the Supabase auth session for an incoming request.
 *
 * NOT yet wired into `proxy.ts` — that integration lands in Phase 1 along with
 * the sign-in flow. When wiring it in, call this BEFORE handing the request to
 * `next-intl/middleware`, and merge the returned response's Set-Cookie headers
 * into the response next-intl produces (the two run in sequence; do not build
 * two independent NextResponse instances).
 */
export async function updateSupabaseSession(request: NextRequest) {
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
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  try {
    await supabase.auth.getUser();
  } catch {
    // Transient Supabase Auth outage: keep stale cookies; next request retries.
  }

  return response;
}
