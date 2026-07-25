-- BSK Phase 2 — patients (customers) + Vietnamese geo + accent-insensitive search.
--
-- Mirrors the original Customer entity + Provinces/Wards lookup. Search is
-- accent-insensitive ("Phuc" finds "Phúc") via an IMMUTABLE unaccent wrapper,
-- exposed through the SECURITY INVOKER search_customers() RPC so RLS still
-- applies. No trigram index — a small-clinic patient table stays fast on a
-- sequential scan; add a GIN index later if the row count ever warrants it.

-- ─── 0. Extensions + immutable unaccent wrapper ──────────────────────────────
-- Supabase hosts extensions in the `extensions` schema.
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- unaccent() is only STABLE; pin the dictionary to make an IMMUTABLE wrapper
-- (safe to call in generated columns / indexes later, and in STABLE queries).
CREATE OR REPLACE FUNCTION bsk.immutable_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  STRICT
  SET search_path = extensions, pg_catalog
AS $$ SELECT unaccent('unaccent', $1) $$;

-- ─── 1. Geo lookup (Vietnamese administrative units) ─────────────────────────
CREATE TABLE IF NOT EXISTS bsk.provinces (
  code text PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS bsk.wards (
  code          text PRIMARY KEY,
  province_code text NOT NULL REFERENCES bsk.provinces(code) ON DELETE CASCADE,
  name          text NOT NULL
);
CREATE INDEX IF NOT EXISTS wards_province_idx ON bsk.wards (province_code);

COMMENT ON TABLE bsk.provinces IS 'Vietnamese provinces (seed via scripts/seed-geo.ts).';
COMMENT ON TABLE bsk.wards IS 'Vietnamese wards under a province (seed via scripts/seed-geo.ts).';

-- ─── 2. Customers (patients) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bsk.customers (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name    text        NOT NULL,
  last_name     text        NOT NULL,
  dob           date,
  gender        text        CHECK (gender IN ('male', 'female', 'other')),
  cccd          text,       -- national ID (Căn cước công dân)
  phone         text,
  province_code text        REFERENCES bsk.provinces(code) ON DELETE SET NULL,
  ward_code     text        REFERENCES bsk.wards(code)     ON DELETE SET NULL,
  address_detail text,      -- street / house number
  deleted       boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE bsk.customers IS
  'Patients. Per-visit vitals (weight/height/BP) live on checkups, not here. '
  'Soft-deleted via the deleted flag. Google Drive fields dropped (Supabase Storage).';

-- ─── 3. Accent-insensitive search RPC (SECURITY INVOKER → RLS applies) ────────
CREATE OR REPLACE FUNCTION bsk.search_customers(q text)
  RETURNS SETOF bsk.customers
  LANGUAGE sql
  STABLE
  SET search_path = bsk, pg_catalog
AS $$
  SELECT *
  FROM   bsk.customers
  WHERE  NOT deleted
    AND  (
      COALESCE(q, '') = ''
      OR bsk.immutable_unaccent(lower(last_name || ' ' || first_name))
           LIKE '%' || bsk.immutable_unaccent(lower(q)) || '%'
      OR COALESCE(phone, '') LIKE '%' || q || '%'
    )
  ORDER BY last_name, first_name
  LIMIT 50
$$;

COMMENT ON FUNCTION bsk.search_customers(text) IS
  'Accent-insensitive patient search by name (or phone substring). SECURITY '
  'INVOKER: runs under the caller RLS. Empty q returns the first 50 patients.';

-- ─── 4. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE bsk.provinces ENABLE ROW LEVEL SECURITY;
ALTER TABLE bsk.wards     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bsk.customers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Geo: readable by any enrolled user (address dropdowns). Writes via seed only.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='bsk' AND tablename='provinces' AND policyname='provinces_select_enrolled') THEN
    CREATE POLICY provinces_select_enrolled ON bsk.provinces FOR SELECT USING (bsk.current_role() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='bsk' AND tablename='wards' AND policyname='wards_select_enrolled') THEN
    CREATE POLICY wards_select_enrolled ON bsk.wards FOR SELECT USING (bsk.current_role() IS NOT NULL);
  END IF;

  -- Customers: read for any enrolled staff; write for clinical roles.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='bsk' AND tablename='customers' AND policyname='customers_select_enrolled') THEN
    CREATE POLICY customers_select_enrolled ON bsk.customers FOR SELECT USING (bsk.current_role() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='bsk' AND tablename='customers' AND policyname='customers_insert_staff') THEN
    CREATE POLICY customers_insert_staff ON bsk.customers FOR INSERT
      WITH CHECK (bsk.current_role() IN ('admin','receptionist','doctor','nurse'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='bsk' AND tablename='customers' AND policyname='customers_update_staff') THEN
    CREATE POLICY customers_update_staff ON bsk.customers FOR UPDATE
      USING (bsk.current_role() IN ('admin','receptionist','doctor','nurse'))
      WITH CHECK (bsk.current_role() IN ('admin','receptionist','doctor','nurse'));
  END IF;
END
$$;

-- ─── 5. Grants ───────────────────────────────────────────────────────────────
GRANT SELECT ON bsk.provinces, bsk.wards TO authenticated;
GRANT SELECT, INSERT, UPDATE ON bsk.customers TO authenticated;
GRANT EXECUTE ON FUNCTION bsk.immutable_unaccent(text) TO authenticated;
GRANT EXECUTE ON FUNCTION bsk.search_customers(text) TO authenticated;
