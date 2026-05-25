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
 * - inviteUserByEmail is idempotent for existing auth.users rows: it resends
 *   an invite / password-reset link. We still insert the bsk.app_users row
 *   to enroll them in BSK. If the insert fails due to a duplicate key (user
 *   was already enrolled), we surface errorEmailTaken.
 */

import { getTranslations } from "next-intl/server";

import { getServerSession } from "@/lib/auth/get-server-session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { InviteUserSchema, type InviteUserState } from "@/lib/auth/invite-schema";

export async function inviteUserAction(
  _prevState: InviteUserState,
  formData: FormData,
): Promise<InviteUserState> {
  const t = await getTranslations("admin.invite");

  // ── Caller-role check (defense-in-depth) ──────────────────────────────────
  const session = await getServerSession();
  if (!session || session.role !== "admin") {
    return { status: "error", fieldErrors: {}, formError: t("errorForbidden") };
  }

  // ── Input validation ───────────────────────────────────────────────────────
  const parsed = InviteUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return {
      status: "error",
      fieldErrors: flat.fieldErrors as Record<string, string[]>,
      formError: null,
    };
  }

  const { email, role } = parsed.data;
  const supabaseAdmin = createSupabaseAdminClient();

  // ── Create / re-invite the auth.users row ──────────────────────────────────
  const { data: inviteData, error: inviteError } =
    await supabaseAdmin.auth.admin.inviteUserByEmail(email);

  if (inviteError || !inviteData.user) {
    return { status: "error", fieldErrors: {}, formError: t("errorGeneric") };
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
    const isEmailTaken = enrollError.code === "23505";
    return {
      status: "error",
      fieldErrors: {},
      formError: isEmailTaken ? t("errorEmailTaken") : t("errorGeneric"),
    };
  }

  return { status: "success", invitedEmail: email };
}
