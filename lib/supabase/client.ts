import { createBrowserClient } from "@supabase/ssr";
import { clientEnv, SUPABASE_SCHEMA } from "@/lib/env/client";

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      db: { schema: SUPABASE_SCHEMA },
    },
  );
}
