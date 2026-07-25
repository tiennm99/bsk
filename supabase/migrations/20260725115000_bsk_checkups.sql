-- BSK Phase 3 — queue & checkup workflow.
--
-- shifts (lookup) + daily_queue_counters (per-day-per-shift number state) +
-- checkups (the visit record: vitals, diagnosis, conclusion, recheck). Queue
-- numbers are assigned atomically by register_checkup() (SECURITY DEFINER) so
-- concurrent receptionists never collide. Status flow: waiting → in_progress →
-- done. Soft-delete via `deleted`.

-- ─── 0. Enum + updated_at helper ─────────────────────────────────────────────
DO $$
BEGIN
  CREATE TYPE bsk.checkup_status AS ENUM ('waiting', 'in_progress', 'done');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

CREATE OR REPLACE FUNCTION bsk.set_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = bsk, pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

-- ─── 1. Shifts (lookup, seeded) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bsk.shifts (
  id         smallint PRIMARY KEY,
  code       text     NOT NULL UNIQUE,   -- 'morning' | 'afternoon' | 'evening'
  sort_order smallint NOT NULL DEFAULT 0
);

INSERT INTO bsk.shifts (id, code, sort_order) VALUES
  (1, 'morning', 1),
  (2, 'afternoon', 2),
  (3, 'evening', 3)
ON CONFLICT (id) DO NOTHING;

-- ─── 2. Daily queue counters (per day per shift) ─────────────────────────────
CREATE TABLE IF NOT EXISTS bsk.daily_queue_counters (
  day         date     NOT NULL,
  shift_id    smallint NOT NULL REFERENCES bsk.shifts(id),
  last_number integer  NOT NULL DEFAULT 0,
  PRIMARY KEY (day, shift_id)
);

COMMENT ON TABLE bsk.daily_queue_counters IS
  'Per-day, per-shift queue counter. Only bsk.register_checkup() writes it '
  '(atomic upsert) — no client grants.';

-- ─── 3. Checkups ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bsk.checkups (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id    bigint      NOT NULL REFERENCES bsk.customers(id),
  doctor_id      bigint      REFERENCES bsk.doctors(id),
  template_id    bigint      REFERENCES bsk.checkup_templates(id),
  shift_id       smallint    REFERENCES bsk.shifts(id),
  queue_number   integer,
  -- Clinic-local "today" (VN), not UTC, so the daily queue rolls over correctly.
  checkup_date   date        NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
  status         bsk.checkup_status NOT NULL DEFAULT 'waiting',
  checkup_type   text,
  symptoms       text,
  diagnosis      text,
  conclusion     text,
  notes          text,
  heart_beat     text,
  blood_pressure text,
  temperature    numeric(4, 1),
  weight         numeric(5, 2),
  height         numeric(5, 2),
  recheck_date   date,
  created_by     uuid        REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted        boolean     NOT NULL DEFAULT false
);

COMMENT ON TABLE bsk.checkups IS
  'Visit record. Queue numbers assigned by register_checkup(). Vitals+diagnosis '
  'filled by the doctor. Soft-deleted. Realtime queue subscribes to this table.';

CREATE INDEX IF NOT EXISTS checkups_today_idx
  ON bsk.checkups (checkup_date, shift_id, queue_number) WHERE NOT deleted;
CREATE INDEX IF NOT EXISTS checkups_customer_idx ON bsk.checkups (customer_id);

DROP TRIGGER IF EXISTS checkups_set_updated_at ON bsk.checkups;
CREATE TRIGGER checkups_set_updated_at
  BEFORE UPDATE ON bsk.checkups
  FOR EACH ROW EXECUTE FUNCTION bsk.set_updated_at();

-- ─── 4. register_checkup: atomic queue-number assignment + insert ────────────
CREATE OR REPLACE FUNCTION bsk.register_checkup(
  p_customer_id  bigint,
  p_shift_id     smallint,
  p_doctor_id    bigint DEFAULT NULL,
  p_template_id  bigint DEFAULT NULL,
  p_checkup_type text   DEFAULT NULL
)
  RETURNS bigint
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = bsk, pg_catalog
AS $$
DECLARE
  v_role   bsk.app_role := bsk.current_role();
  v_number integer;
  v_id     bigint;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('admin', 'receptionist', 'doctor', 'nurse') THEN
    RAISE EXCEPTION 'not authorized to register a checkup';
  END IF;

  -- Atomic per-day/shift counter bump — returns the freshly-assigned number.
  -- "day" is clinic-local (VN) to match checkups.checkup_date.
  INSERT INTO bsk.daily_queue_counters (day, shift_id, last_number)
  VALUES ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, p_shift_id, 1)
  ON CONFLICT (day, shift_id)
    DO UPDATE SET last_number = bsk.daily_queue_counters.last_number + 1
  RETURNING last_number INTO v_number;

  INSERT INTO bsk.checkups (customer_id, doctor_id, template_id, shift_id, queue_number, checkup_type, created_by)
  VALUES (p_customer_id, p_doctor_id, p_template_id, p_shift_id, v_number, p_checkup_type, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END
$$;

COMMENT ON FUNCTION bsk.register_checkup(bigint, smallint, bigint, bigint, text) IS
  'Assigns the next per-day/shift queue number atomically and inserts a waiting '
  'checkup. SECURITY DEFINER, role-gated to clinical staff. Returns the new id.';

-- ─── 5. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE bsk.shifts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE bsk.daily_queue_counters ENABLE ROW LEVEL SECURITY;  -- no policies: DEFINER-only
ALTER TABLE bsk.checkups             ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='bsk' AND tablename='shifts' AND policyname='shifts_select_enrolled') THEN
    CREATE POLICY shifts_select_enrolled ON bsk.shifts FOR SELECT USING (bsk.current_role() IS NOT NULL);
  END IF;

  -- Checkups: read for any enrolled staff; write (status, vitals, soft-delete)
  -- for clinical roles. Inserts go through register_checkup (DEFINER).
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='bsk' AND tablename='checkups' AND policyname='checkups_select_enrolled') THEN
    CREATE POLICY checkups_select_enrolled ON bsk.checkups FOR SELECT USING (bsk.current_role() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='bsk' AND tablename='checkups' AND policyname='checkups_update_clinical') THEN
    CREATE POLICY checkups_update_clinical ON bsk.checkups FOR UPDATE
      USING (bsk.current_role() IN ('admin','receptionist','doctor','nurse'))
      WITH CHECK (bsk.current_role() IN ('admin','receptionist','doctor','nurse'));
  END IF;
END
$$;

-- ─── 6. Grants ───────────────────────────────────────────────────────────────
GRANT SELECT ON bsk.shifts TO authenticated;
GRANT SELECT, UPDATE ON bsk.checkups TO authenticated;  -- no INSERT: use register_checkup
GRANT EXECUTE ON FUNCTION bsk.register_checkup(bigint, smallint, bigint, bigint, text) TO authenticated;
