import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { serverEnv, SUPABASE_SCHEMA } from "@/lib/env/server";

/**
 * Per-request Supabase client for RSC and Server Actions.
 * MUST be called outside a `'use cache'` scope — it depends on cookies().
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      db: { schema: SUPABASE_SCHEMA },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set({ name, value, ...options });
            }
          } catch {
            // setAll throws from Server Components; the proxy-layer refresh handles it.
          }
        },
      },
    },
  );
}
