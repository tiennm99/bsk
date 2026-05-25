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

import { getLocale, getTranslations } from "next-intl/server";

import { redirect } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseSignIn, type SignInState } from "@/lib/auth/schemas";

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
  const { data: enrollment } = await supabase
    .from("app_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!enrollment) {
    // Sign out so the session cookie is not left in a half-authenticated state.
    await supabase.auth.signOut();
    return {
      status: "error",
      fieldErrors: {},
      formError: t("invalidCredentials"),
    };
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
