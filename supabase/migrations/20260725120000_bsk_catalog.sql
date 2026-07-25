-- BSK Phase 4 — medicine + service catalogs.
--
-- Master data for prescriptions (medicines) and billable services. Money is
-- stored as INTEGER VND (đồng has no minor unit) — never floats. Reads for any
-- enrolled staff (needed to compose prescriptions/invoices); writes admin-only.

-- ─── Medicines ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bsk.medicines (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       text        NOT NULL,
  unit       text,                          -- viên, ống, chai…
  sale_price bigint      NOT NULL DEFAULT 0 CHECK (sale_price >= 0),  -- VND charged
  cost_price bigint      CHECK (cost_price >= 0),                     -- VND cost (optional)
  company    text,
  route      text,                          -- uống, tiêm…
  deleted    boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS medicines_active_idx ON bsk.medicines (deleted) WHERE NOT deleted;

-- ─── Services ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bsk.services (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       text        NOT NULL,
  price      bigint      NOT NULL DEFAULT 0 CHECK (price >= 0),       -- VND
  deleted    boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS services_active_idx ON bsk.services (deleted) WHERE NOT deleted;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE bsk.medicines ENABLE ROW LEVEL SECURITY;
ALTER TABLE bsk.services  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='bsk' AND tablename='medicines' AND policyname='medicines_select_enrolled') THEN
    CREATE POLICY medicines_select_enrolled ON bsk.medicines FOR SELECT USING (bsk.current_role() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='bsk' AND tablename='medicines' AND policyname='medicines_insert_admin') THEN
    CREATE POLICY medicines_insert_admin ON bsk.medicines FOR INSERT WITH CHECK (bsk.current_role() = 'admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='bsk' AND tablename='medicines' AND policyname='medicines_update_admin') THEN
    CREATE POLICY medicines_update_admin ON bsk.medicines FOR UPDATE USING (bsk.current_role() = 'admin') WITH CHECK (bsk.current_role() = 'admin');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='bsk' AND tablename='services' AND policyname='services_select_enrolled') THEN
    CREATE POLICY services_select_enrolled ON bsk.services FOR SELECT USING (bsk.current_role() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='bsk' AND tablename='services' AND policyname='services_insert_admin') THEN
    CREATE POLICY services_insert_admin ON bsk.services FOR INSERT WITH CHECK (bsk.current_role() = 'admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='bsk' AND tablename='services' AND policyname='services_update_admin') THEN
    CREATE POLICY services_update_admin ON bsk.services FOR UPDATE USING (bsk.current_role() = 'admin') WITH CHECK (bsk.current_role() = 'admin');
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE ON bsk.medicines TO authenticated;
GRANT SELECT, INSERT, UPDATE ON bsk.services  TO authenticated;
