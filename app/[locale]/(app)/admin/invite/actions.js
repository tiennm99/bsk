"use server";

/**
 * Server Action for admin user-invite flow.
 *
 * Security notes:
 * - Caller-role check via getServerSession() is defense-in-depth.
 *   The (app)/admin layout (phase 06) enforces the admin gate at the route
 *   level; this check ensures the action itself cannot be called by a
 *   non-admin even if the layout is bypassed (e.g. direct fetch).
 * - The admin client (service-role key) is used for both auth.admin.inviteUserByEmail
 *   AND the bsk.app_users insert, because that table has no INSERT RLS policy
 *   by design — only privileged writes are allowed.
 * - inviteUserByEmail ERRORS when the email already has an auth.users row
 *   (e.g. created by a sibling app on the shared pool). We detect that case and
 *   surface errorEmailTaken rather than a generic error.
 * - Orphan safety: if the invite creates a fresh auth.users row but the
 *   bsk.app_users enroll then fails for a non-duplicate reason, we delete the
 *   just-created auth row so the shared pool doesn't accumulate orphans.
 */

import { getTranslations } from "next-intl/server";

import { getServerSession } from "@/lib/auth/get-server-session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createRateLimiter } from "@/lib/upstash";
import { InviteUserSchema } from "@/lib/auth/invite-schema";

/** @typedef {import('@/lib/auth/invite-schema').InviteUserState} InviteUserState */

// Bound SMTP spend on the SHARED project: cap invites per admin. 20 / hour.
const inviteLimiter = createRateLimiter("invite", 20, 3600);

/**
 * @param {InviteUserState} _prevState
 * @param {FormData} formData
 * @returns {Promise<InviteUserState>}
 */
export async function inviteUserAction(_prevState, formData) {
  const t = await getTranslations("admin.invite");

  // ── Caller-role check (defense-in-depth) ──────────────────────────────────
  const session = await getServerSession();
  if (!session || session.role !== "admin") {
    return { status: "error", fieldErrors: {}, formError: t("errorForbidden") };
  }

  // ── Rate limit (bound shared-project SMTP spend) ─────────────────────────────
  // Keyed by admin id (server-derived, not spoofable). Fail CLOSED on Redis
  // outage: unlike a login retry, SMTP spend on the shared project cannot be
  // undone, and an admin can simply retry once Redis is back. (The login
  // limiter stays fail-open — availability wins there.)
  try {
    const { success: withinLimit } = await inviteLimiter.limit(session.user.id);
    if (!withinLimit) {
      return { status: "error", fieldErrors: {}, formError: t("tooManyRequests") };
    }
  } catch (err) {
    console.warn("[invite] rate limiter unavailable, failing closed:", err);
    return { status: "error", fieldErrors: {}, formError: t("tooManyRequests") };
  }

  // ── Input validation ───────────────────────────────────────────────────────
  const parsed = InviteUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return {
      status: "error",
      fieldErrors: /** @type {Record<string, string[]>} */ (flat.fieldErrors),
      formError: null,
    };
  }

  const { email, role } = parsed.data;
  const supabaseAdmin = createSupabaseAdminClient();

  // ── Create the auth.users row ──────────────────────────────────────────────
  const { data: inviteData, error: inviteError } =
    await supabaseAdmin.auth.admin.inviteUserByEmail(email);

  if (inviteError || !inviteData.user) {
    // An existing email (often a sibling-app user on the shared auth pool)
    // makes inviteUserByEmail fail — report it as "already enrolled/known"
    // rather than a generic error so the admin understands what happened.
    const code = /** @type {{ code?: string } | null} */ (inviteError)?.code;
    const msg = inviteError?.message?.toLowerCase() ?? "";
    const emailExists =
      code === "email_exists" ||
      msg.includes("already been registered") ||
      msg.includes("already registered") ||
      msg.includes("already exists");
    return {
      status: "error",
      fieldErrors: {},
      formError: emailExists ? t("errorEmailTaken") : t("errorGeneric"),
    };
  }

  const newUserId = inviteData.user.id;

  // ── Enroll in bsk.app_users (admin client bypasses RLS by design) ──────────
  const { error: enrollError } = await supabaseAdmin.from("app_users").insert({
    user_id: newUserId,
    role,
    invited_by: session.user.id,
  });

  if (enrollError) {
    // Postgres unique-violation code 23505 → user already enrolled.
    if (enrollError.code === "23505") {
      return { status: "error", fieldErrors: {}, formError: t("errorEmailTaken") };
    }
    // Non-duplicate failure on a freshly-created row: roll it back so the
    // shared auth pool doesn't accumulate an orphaned, un-enrolled user.
    await supabaseAdmin.auth.admin.deleteUser(newUserId).catch(() => {});
    return { status: "error", fieldErrors: {}, formError: t("errorGeneric") };
  }

  return { status: "success", invitedEmail: email };
}
