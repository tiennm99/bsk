"use server";

/**
 * Staff management Server Actions (admin only). The invite flow remains the
 * create path; here an admin can change a member's role or revoke access
 * (delete the bsk.app_users enrollment — auth.users is untouched).
 *
 * Writes use the admin (service_role) client, consistent with the invite flow
 * and the app_users least-privilege posture (authenticated has no direct write).
 * Guards: an admin cannot change/remove their OWN row, and the LAST admin
 * cannot be demoted or removed (avoids locking everyone out).
 */

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { getServerSession } from "@/lib/auth/get-server-session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAppRole } from "@/lib/db/roles";

async function revalidateStaff() {
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/staff`);
}

/** True if removing/demoting this user would leave zero admins. */
async function isLastAdmin(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
): Promise<boolean> {
  const { data: target } = await admin
    .from("app_users")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (target?.role !== "admin") return false;

  const { count } = await admin
    .from("app_users")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "admin");
  return (count ?? 0) <= 1;
}

export async function updateStaffRoleAction(formData: FormData): Promise<void> {
  const session = await getServerSession();
  if (session?.role !== "admin") return;

  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!userId || !isAppRole(role)) return;
  if (userId === session.user.id) return; // no self role-change

  const admin = createSupabaseAdminClient();
  if (role !== "admin" && (await isLastAdmin(admin, userId))) return; // keep >=1 admin

  const { error } = await admin.from("app_users").update({ role }).eq("user_id", userId);
  if (!error) {
    await admin.rpc("log_audit", {
      p_action: "staff.role_change",
      p_entity: "app_users",
      p_entity_id: userId,
      p_details: { role },
    });
    await revalidateStaff();
  }
}

export async function removeStaffAction(formData: FormData): Promise<void> {
  const session = await getServerSession();
  if (session?.role !== "admin") return;

  const userId = String(formData.get("userId") ?? "");
  if (!userId || userId === session.user.id) return; // no self removal

  const admin = createSupabaseAdminClient();
  if (await isLastAdmin(admin, userId)) return; // never remove the last admin

  const { error } = await admin.from("app_users").delete().eq("user_id", userId);
  if (!error) {
    await admin.rpc("log_audit", {
      p_action: "staff.remove",
      p_entity: "app_users",
      p_entity_id: userId,
    });
    await revalidateStaff();
  }
}
