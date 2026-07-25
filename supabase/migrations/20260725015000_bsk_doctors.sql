-- BSK Phase 2 — doctors catalog.
--
-- Mirrors the original Doctor entity (first_name, last_name, soft-delete).
-- Reads: any enrolled staff (doctors appear in assignment dropdowns).
-- Writes: admin only, enforced by RLS (no service_role needed — mutations run
-- through the caller's user client so the admin policy is the gate).

-- ─── 1. Table ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bsk.doctors (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name text        NOT NULL,
  last_name  text        NOT NULL,
  deleted    boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE bsk.doctors IS
  'Clinic doctors. Soft-deleted via the deleted flag (never hard-deleted) so '
  'historical checkups keep a valid doctor reference. Admin-managed.';

CREATE INDEX IF NOT EXISTS doctors_active_idx ON bsk.doctors (deleted) WHERE NOT deleted;

-- ─── 2. RLS ────────────────────────────────────────────────────────────────

ALTER TABLE bsk.doctors ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Read: any enrolled user (current_role() is non-null only for enrolled staff).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'bsk' AND tablename = 'doctors' AND policyname = 'doctors_select_enrolled'
  ) THEN
    CREATE POLICY doctors_select_enrolled
      ON bsk.doctors FOR SELECT
      USING (bsk.current_role() IS NOT NULL);
  END IF;

  -- Insert: admin only.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'bsk' AND tablename = 'doctors' AND policyname = 'doctors_insert_admin'
  ) THEN
    CREATE POLICY doctors_insert_admin
      ON bsk.doctors FOR INSERT
      WITH CHECK (bsk.current_role() = 'admin');
  END IF;

  -- Update: admin only (covers soft-delete via the deleted flag).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'bsk' AND tablename = 'doctors' AND policyname = 'doctors_update_admin'
  ) THEN
    CREATE POLICY doctors_update_admin
      ON bsk.doctors FOR UPDATE
      USING (bsk.current_role() = 'admin')
      WITH CHECK (bsk.current_role() = 'admin');
  END IF;
END
$$;

-- ─── 3. Grants ─────────────────────────────────────────────────────────────
-- No DELETE grant: rows are soft-deleted (UPDATE deleted = true), never removed.
GRANT SELECT, INSERT, UPDATE ON bsk.doctors TO authenticated;
