"use server";

/**
 * Server Actions for the BSK sign-in / sign-out flow.
 *
 * Security notes:
 * - Auth error messages are intentionally generic (same string for wrong-password
 *   AND unenrolled-user paths) to prevent auth.users enumeration.
 * - The unenrolled path has a slight timing difference vs. wrong-password
 *   (extra signOut round-trip). Accepted for educational scope; documented here.
 * - No PII is logged at any point.
 * - redirect() is called OUTSIDE any try/catch. React 19 / Next.js 16 implement
 *   redirect() via a special thrown error symbol; catching it swallows the
 *   redirect silently.
 */

import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";

import { redirect } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createRateLimiter } from "@/lib/upstash";
import { parseSignIn, type SignInState } from "@/lib/auth/schemas";

// Brute-force guard on the SHARED Supabase auth quota. Keyed by client IP
// (not email) so an attacker cannot lock a specific victim out. 5 tries / 60s.
const signInLimiter = createRateLimiter("login", 5, 60);

// ---------------------------------------------------------------------------
// signInAction
// ---------------------------------------------------------------------------

/**
 * React 19 `useActionState`-compatible Server Action for email/password sign-in.
 *
 * Flow:
 *  1. Validate FormData with SignInSchema — field errors returned on fail.
 *  2. supabase.auth.signInWithPassword — generic error on auth failure.
 *  3. Enrollment check: verify user has a bsk.app_users row. If absent, sign
 *     out and return the same generic error (enumeration defense).
 *  4. redirect to /${locale}/dashboard — never returns on the success path.
 */
export async function signInAction(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const t = await getTranslations("auth.signIn");

  // Step 1 — schema validation
  const parsed = parseSignIn(formData);
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.fieldErrors, formError: null };
  }

  const { email, password } = parsed.data;

  // Step 1b — rate limit by client IP before hitting Supabase auth.
  // Key on the PLATFORM-set IP, never the client-appendable leftmost
  // x-forwarded-for hop (rotating that header would mint a fresh bucket per
  // request and bypass the limit). Prefer Vercel's x-real-ip; else the LAST
  // XFF hop (appended by the trusted proxy).
  const hdrs = await headers();
  const xff = hdrs.get("x-forwarded-for");
  const ip = hdrs.get("x-real-ip")?.trim() || xff?.split(",").at(-1)?.trim() || null;
  // Only rate-limit when a real client IP is resolvable. If neither header is
  // set (misconfigured proxy / non-Vercel host), skip rather than bucket every
  // request under a shared "unknown" key — which would lock out the whole clinic
  // after 5 attempts/min. Logged so the missing-IP case is visible.
  if (!ip) {
    console.warn("[sign-in] no client IP header; skipping rate limit");
  } else {
    try {
      const { success: withinLimit } = await signInLimiter.limit(ip);
      if (!withinLimit) {
        return { status: "error", fieldErrors: {}, formError: t("tooManyAttempts") };
      }
    } catch (err) {
      // Shared Redis unavailable: fail OPEN so a sibling app's outage can't lock
      // doctors out of the clinic. Logged so the gap in brute-force protection
      // is alertable rather than silent.
      console.warn("[sign-in] rate limiter unavailable, failing open:", err);
    }
  }

  const supabase = await createSupabaseServerClient();

  // Step 2 — authenticate
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.user) {
    return {
      status: "error",
      fieldErrors: {},
      formError: t("invalidCredentials"),
    };
  }

  const user = authData.user;

  // Step 3 — enrollment check
  // Verify the authenticated user has a row in bsk.app_users. Users who exist
  // in auth.users but have never been enrolled by an admin must be rejected.
  // We return the SAME generic error as wrong-password (enumeration defense).
  let { data: enrollment } = await supabase
    .from("app_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!enrollment) {
    // First-admin bootstrap: allowlist-gated, race-safe SECURITY DEFINER RPC.
    // Returns true ONLY if the caller's email is in bsk.admin_allowlist AND
    // bsk.app_users is empty. Safe to call unconditionally — a non-allowlisted
    // or non-first caller simply gets false and is rejected below. (The old
    // client-side count guard was dead: under the caller's RLS an unenrolled
    // user always sees zero rows, so it protected nothing.)
    const { data: claimed } = await supabase.rpc("claim_first_admin");

    if (claimed === true) {
      // Re-fetch enrollment now that the row exists (role = 'admin').
      const { data: refetched } = await supabase
        .from("app_users")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      enrollment = refetched;
    }

    // If enrollment is still null after the claim attempt (not allowlisted,
    // table non-empty, or race lost), sign out and return a generic error.
    if (!enrollment) {
      await supabase.auth.signOut();
      return {
        status: "error",
        fieldErrors: {},
        formError: t("invalidCredentials"),
      };
    }
  }

  // Step 4 — redirect to dashboard
  // redirect() throws a NEXT_REDIRECT error symbol; action never returns here.
  // Must be called OUTSIDE try/catch to avoid swallowing the thrown symbol.
  // The `return` prefix lets TypeScript infer this branch as never-returning.
  const locale = await getLocale();
  return redirect({ href: `/${locale}/dashboard`, locale });
}

// ---------------------------------------------------------------------------
// signOutAction
// ---------------------------------------------------------------------------

/**
 * Parameterless Server Action for sign-out.
 *
 * Clears the session cookie via Supabase SDK then redirects to sign-in.
 * The try/catch around signOut is intentional: cookie clearing is local, so
 * even if the Supabase call fails we still redirect to clear the UI state.
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();

  try {
    await supabase.auth.signOut();
  } catch {
    // Transient failure — proceed to redirect; cookies are cleared locally.
  }

  const locale = await getLocale();
  redirect({ href: `/${locale}/sign-in`, locale });
}
