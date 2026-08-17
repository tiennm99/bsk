"use server";

/**
 * Staff management Server Actions (admin only). The invite flow remains the
 * create path; here an admin can change a member's role or revoke access.
 *
 * Mutations go through the set_staff_role / remove_staff RPCs (SECURITY DEFINER,
 * gated on the caller's current_role() via the USER client) which hold an
 * advisory lock while enforcing the "keep >= 1 admin" and "no self-change"
 * invariants — race-safe, unlike a check-then-act in app code.
 */

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { getServerSession } from "@/lib/auth/get-server-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAppRole } from "@/lib/db/roles";

async function revalidateStaff() {
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/staff`);
}

export async function updateStaffRoleAction(formData: FormData): Promise<void> {
  const session = await getServerSession();
  if (session?.role !== "admin") return;

  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!userId || !isAppRole(role) || userId === session.user.id) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_staff_role", { p_user_id: userId, p_role: role });
  if (!error) {
    await supabase.rpc("log_audit", {
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
  if (!userId || userId === session.user.id) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_staff", { p_user_id: userId });
  if (!error) {
    await supabase.rpc("log_audit", {
      p_action: "staff.remove",
      p_entity: "app_users",
      p_entity_id: userId,
    });
    await revalidateStaff();
  }
}
