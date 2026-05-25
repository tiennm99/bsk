/**
 * Admin invite page — Server Component.
 *
 * Phase 06 will install the (app)/admin layout that enforces role='admin'
 * at the route level. Until then, defense-in-depth lives inside
 * inviteUserAction itself (caller-role check via getServerSession).
 *
 * This page intentionally does NOT redirect non-admins — that is the layout's
 * responsibility (phase 06). The action rejects unauthorized submissions.
 */

import { getTranslations } from "next-intl/server";
import { InviteUserForm } from "./invite-user-form";

export default async function AdminInvitePage() {
  const t = await getTranslations("admin.invite");

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-foreground mb-6 text-xl font-semibold">{t("title")}</h1>
      <InviteUserForm />
    </main>
  );
}
