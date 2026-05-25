import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv, SUPABASE_SCHEMA } from "@/lib/env/server";

/**
 * Privileged Supabase client (uses the secret key, bypasses RLS on behalf of no user).
 * Use only for admin tasks: invites, cron sweeps, system writes.
 * NEVER expose this client to the browser or pass its results through `'use cache'`.
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
