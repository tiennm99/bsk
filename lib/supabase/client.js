import { createBrowserClient } from "@supabase/ssr";
import { clientEnv, SUPABASE_SCHEMA } from "@/lib/env/client";

/** Browser Supabase client scoped to the bsk schema. Return type stays inferred so realtime/query generics flow to callers. */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      db: { schema: SUPABASE_SCHEMA },
    },
  );
}
