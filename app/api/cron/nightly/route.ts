/**
 * Nightly cron (Vercel Cron → this route). Enforces the 7-day media retention
 * window: removes checkup images older than 7 days from Storage and soft-deletes
 * their rows, keeping the shared Supabase free-tier storage budget bounded
 * (PLAN §5/§7). Uses the admin client (service_role) since it runs unattended.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. We reject
 * anything that doesn't match, so the endpoint can't be triggered by outsiders.
 */

import { serverEnv } from "@/lib/env/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RETENTION_DAYS = 7;
const MEDIA_BUCKET = "bsk-checkup-media";

export async function GET(req: Request) {
  if (!serverEnv.CRON_SECRET) {
    return new Response("CRON_SECRET not configured", { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${serverEnv.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();

  const { data: stale, error } = await admin
    .from("checkup_images")
    .select("id, storage_path")
    .lt("created_at", cutoff)
    .eq("deleted", false)
    .limit(1000);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = stale ?? [];
  if (rows.length === 0) {
    return Response.json({ ok: true, swept: 0 });
  }

  // Remove objects first (best-effort), then soft-delete the metadata rows.
  await admin.storage.from(MEDIA_BUCKET).remove(rows.map((r) => r.storage_path));
  const { error: updErr } = await admin
    .from("checkup_images")
    .update({ deleted: true })
    .in(
      "id",
      rows.map((r) => r.id),
    );

  if (updErr) {
    return Response.json(
      { ok: false, error: updErr.message, removedObjects: rows.length },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, swept: rows.length });
}
