import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv, SUPABASE_SCHEMA } from "@/lib/env/server";

/**
 * Privileged Supabase client (uses the secret key, bypasses RLS on behalf of no user).
 * Use only for admin tasks: invites, cron sweeps, system writes.
 * NEVER expose this client to the browser.
 *
 * `'use cache'` interaction: this factory does NOT read cookies, so it is safe
 * to call inside a cached scope. But if the result depends on a caller's identity
 * (user / role / tenant), the cache key MUST partition on that identity — otherwise
 * one user sees another user's data. For genuinely user-agnostic reads (e.g.
 * clinic settings, services list), no key partitioning is needed.
 */
export function createSupabaseAdminClient() {
  return createClient(serverEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SECRET_KEY, {
    db: { schema: SUPABASE_SCHEMA },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
