import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAppRole, type AppRole } from "@/lib/db/roles";

// Derive the User type from the factory's return type so we never import
// @supabase/supabase-js directly (ESLint no-restricted-imports enforces that
// only the named factory files in lib/supabase/* may do so).
type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type GetUserResult = Awaited<ReturnType<SupabaseServerClient["auth"]["getUser"]>>;
export type User = NonNullable<GetUserResult["data"]["user"]>;

export type ServerSession = {
  user: User;
  role: AppRole | null;
  /** Display name from bsk.app_users.full_name; null until an admin sets it. */
  fullName: string | null;
};

/**
 * Reads the authenticated user and their BSK role from the current request.
 *
 * Returns `null` when unauthenticated or when `getUser()` fails (transient
 * Supabase outage). Returns `{ user, role: null }` when the user is
 * authenticated but has no row in `bsk.app_users` (e.g. just signed up,
 * awaiting role assignment by admin).
 *
 * MUST be called outside any `'use cache'` scope — it calls
 * `createSupabaseServerClient()` which reads `cookies()`. Cached helpers that
 * need the session must receive `user` / `role` as arguments, never re-read
 * cookies internally.
 *
 * Used by: `[locale]/layout.tsx` (phase 02 establishes the pattern),
 * protected route layouts (phase 06), and Server Actions that need role checks.
 */
export async function getServerSession(): Promise<ServerSession | null> {
  let supabase: SupabaseServerClient;

  try {
    supabase = await createSupabaseServerClient();
  } catch {
    // Cookie store unavailable (e.g. called during static generation).
    return null;
  }

  // getUser() round-trips to Supabase Auth and validates the JWT server-side.
  // Do NOT use getSession() here — it trusts the cookie blob without validation.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError ?? !user) {
    return null;
  }

  // Read role + display name in ONE own-row query. The app_users_select_own
  // RLS policy (migration 20260525163300) permits a user to read their own row,
  // so a direct select is equivalent to the current_role() RPC for the caller's
  // own role — and folds the former separate full_name lookup into the same
  // round-trip. Pre-provisioning (table absent) or transient DB errors fall
  // back to role/fullName = null, never an auth failure.
  let role: AppRole | null = null;
  let fullName: string | null = null;

  try {
    const { data: profile } = await supabase
      .from("app_users")
      .select("role, full_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile) {
      if (isAppRole(profile.role)) role = profile.role;
      fullName = profile.full_name ?? null;
    }
  } catch {
    // Pre-provisioning or transient DB error: proceed with role/fullName null.
  }

  return { user, role, fullName };
}
