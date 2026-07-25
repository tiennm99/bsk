-- BSK Phase 5 — imaging (ultrasound / clinic photos via Supabase Storage).
--
-- Replaces the original's Google Drive OAuth upload with a private Storage
-- bucket. Compression (≤200KB/image) happens client-side; this migration only
-- tracks metadata (bsk.checkup_images) and grants storage.objects access to
-- enrolled staff. Signed URLs are issued server-side with a 1h TTL — never
-- persisted. The 7-day retention sweep is Phase 7's cron job, not built here.

-- ─── 0. Storage bucket (idempotent) ─────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('bsk-checkup-media', 'bsk-checkup-media', false)
ON CONFLICT (id) DO NOTHING;

-- ─── 1. checkup_images (metadata for objects in the bucket) ─────────────────
CREATE TABLE IF NOT EXISTS bsk.checkup_images (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  checkup_id   bigint      NOT NULL REFERENCES bsk.checkups(id) ON DELETE CASCADE,
  storage_path text        NOT NULL UNIQUE,
  created_by   uuid        REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted      boolean     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS checkup_images_checkup_idx
  ON bsk.checkup_images (checkup_id) WHERE NOT deleted;

COMMENT ON TABLE bsk.checkup_images IS
  'Metadata for images stored in the bsk-checkup-media bucket. storage_path is '
  'the object key ({checkup_id}/{uuid}.jpg) — never a signed URL. Soft-deleted '
  'via the deleted flag; the storage object is removed in the same request by '
  'the deleteImageAction Server Action.';

-- ─── 2. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE bsk.checkup_images ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='bsk' AND tablename='checkup_images' AND policyname='checkup_images_select_enrolled') THEN
    CREATE POLICY checkup_images_select_enrolled ON bsk.checkup_images FOR SELECT
      USING (bsk.current_role() IS NOT NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='bsk' AND tablename='checkup_images' AND policyname='checkup_images_insert_clinical') THEN
    CREATE POLICY checkup_images_insert_clinical ON bsk.checkup_images FOR INSERT
      WITH CHECK (bsk.current_role() IN ('admin','receptionist','doctor','nurse'));
  END IF;

  -- Soft-delete goes through UPDATE (deleted=true); no DELETE policy needed.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='bsk' AND tablename='checkup_images' AND policyname='checkup_images_update_clinical') THEN
    CREATE POLICY checkup_images_update_clinical ON bsk.checkup_images FOR UPDATE
      USING (bsk.current_role() IN ('admin','receptionist','doctor','nurse'))
      WITH CHECK (bsk.current_role() IN ('admin','receptionist','doctor','nurse'));
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE ON bsk.checkup_images TO authenticated;

-- ─── 3. Storage RLS (storage.objects — already RLS-enabled by Supabase) ─────
-- Scoped to bucket_id = 'bsk-checkup-media' only; any enrolled BSK staff may
-- manage checkup media (clinical-role gating happens at the checkup_images
-- table level above and in the Server Actions — storage objects mirror that
-- but stay simple: enrolled = can read/write).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='bsk_checkup_media_select') THEN
    CREATE POLICY bsk_checkup_media_select ON storage.objects FOR SELECT
      USING (bucket_id = 'bsk-checkup-media' AND bsk.current_role() IS NOT NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='bsk_checkup_media_insert') THEN
    CREATE POLICY bsk_checkup_media_insert ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'bsk-checkup-media' AND bsk.current_role() IS NOT NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='bsk_checkup_media_update') THEN
    CREATE POLICY bsk_checkup_media_update ON storage.objects FOR UPDATE
      USING (bucket_id = 'bsk-checkup-media' AND bsk.current_role() IS NOT NULL)
      WITH CHECK (bucket_id = 'bsk-checkup-media' AND bsk.current_role() IS NOT NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='bsk_checkup_media_delete') THEN
    CREATE POLICY bsk_checkup_media_delete ON storage.objects FOR DELETE
      USING (bucket_id = 'bsk-checkup-media' AND bsk.current_role() IS NOT NULL);
  END IF;
END
$$;
