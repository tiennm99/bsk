// WARNING: Do NOT add `'use cache'` — reads cookies()/session.

/**
 * Staff management — Server Component (admin only; gated by (app)/admin layout).
 * Lists enrolled users with their email + role; role change and access removal
 * are per-row Server Action forms. The acting admin's own row is read-only.
 */

import { getTranslations } from "next-intl/server";
import { getServerSession } from "@/lib/auth/get-server-session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { appRoles } from "@/lib/db/roles";
import { Button } from "@/components/ui/button";
import { updateStaffRoleAction, removeStaffAction } from "./actions";

/**
 * @param {{ params: Promise<{ locale: string }> }} props
 * @returns {Promise<import("react").JSX.Element>}
 */
export default async function StaffPage({ params }) {
  await params;
  const t = await getTranslations("admin.staff");
  const tRoles = await getTranslations("roles");
  const session = await getServerSession();

  const admin = createSupabaseAdminClient();
  const [{ data: rows }, { data: userList }] = await Promise.all([
    admin
      .from("app_users")
      .select("user_id, role, full_name")
      .order("created_at", { ascending: true }),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const emailById = new Map((userList?.users ?? []).map((u) => [u.id, u.email ?? ""]));
  const staff = rows ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-foreground mb-6 text-xl font-semibold">{t("title")}</h1>

      <ul className="divide-border divide-y">
        {staff.map((s) => {
          const isSelf = s.user_id === session?.user.id;
          const label = s.full_name || emailById.get(s.user_id) || s.user_id;
          return (
            <li key={s.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-foreground truncate font-medium">
                  {label}
                  {isSelf && <span className="text-muted-foreground ml-2 text-xs">{t("you")}</span>}
                </p>
                {s.full_name && (
                  <p className="text-muted-foreground truncate text-xs">
                    {emailById.get(s.user_id)}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <form action={updateStaffRoleAction} className="flex items-center gap-1">
                  <input type="hidden" name="userId" value={s.user_id} />
                  <label htmlFor={`role-${s.user_id}`} className="sr-only">
                    {t("role")}
                  </label>
                  <select
                    id={`role-${s.user_id}`}
                    name="role"
                    defaultValue={s.role}
                    disabled={isSelf}
                    className="border-input bg-background text-foreground focus-visible:ring-ring h-10 rounded-md border px-2 text-sm focus:outline-none focus-visible:ring-2 disabled:opacity-50"
                  >
                    {appRoles.map((r) => (
                      <option key={r} value={r}>
                        {tRoles(r)}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" variant="outline" disabled={isSelf}>
                    {t("save")}
                  </Button>
                </form>
                <form action={removeStaffAction}>
                  <input type="hidden" name="userId" value={s.user_id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    className="text-destructive"
                    disabled={isSelf}
                  >
                    {t("remove")}
                  </Button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
