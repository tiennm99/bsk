-- BSK Phase 2 — clinic settings (singleton).
--
-- Mirrors the original Clinic/ClinicInfo: name, address, phone, and the code
-- prefix used on printed barcodes. One row for the whole deployment.
-- Reads: any enrolled staff (shown in headers/reports). Writes: admin only.

-- ─── 1. Table (singleton via boolean PK pinned to true) ──────────────────────

CREATE TABLE IF NOT EXISTS bsk.clinic_settings (
  id         boolean     PRIMARY KEY DEFAULT true CHECK (id),
  name       text,
  address    text,
  phone      text,
  prefix     text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE bsk.clinic_settings IS
  'Single-row clinic profile (id is pinned true by the CHECK, so only one row '
  'can ever exist). name/address/phone for report headers; prefix for barcodes.';

-- Seed the singleton so the settings form always has a row to update.
INSERT INTO bsk.clinic_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ─── 2. RLS ────────────────────────────────────────────────────────────────

ALTER TABLE bsk.clinic_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'bsk' AND tablename = 'clinic_settings'
      AND policyname = 'clinic_settings_select_enrolled'
  ) THEN
    CREATE POLICY clinic_settings_select_enrolled
      ON bsk.clinic_settings FOR SELECT
      USING (bsk.current_role() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'bsk' AND tablename = 'clinic_settings'
      AND policyname = 'clinic_settings_insert_admin'
  ) THEN
    CREATE POLICY clinic_settings_insert_admin
      ON bsk.clinic_settings FOR INSERT
      WITH CHECK (bsk.current_role() = 'admin');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'bsk' AND tablename = 'clinic_settings'
      AND policyname = 'clinic_settings_update_admin'
  ) THEN
    CREATE POLICY clinic_settings_update_admin
      ON bsk.clinic_settings FOR UPDATE
      USING (bsk.current_role() = 'admin')
      WITH CHECK (bsk.current_role() = 'admin');
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE ON bsk.clinic_settings TO authenticated;
