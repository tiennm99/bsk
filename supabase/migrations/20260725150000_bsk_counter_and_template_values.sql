-- BSK — closes the last two original-app feature gaps.
--
-- (a) Manual queue-counter control (orig SetCounterRequest / GetCounterRequest):
--     admin/receptionist can set today's per-shift counter directly (e.g. to
--     correct a miscount or reset after a printer jam) via set_queue_counter().
--     daily_queue_counters was DEFINER-only (no SELECT policy); staff need to
--     see the current numbers, so we add a read-only SELECT policy here.
-- (b) Checkup templates are now actually applied: checkups.template_values
--     stores the doctor's filled-in snapshot of the chosen template's fields.

-- ─── (a) set_queue_counter — manual counter override ────────────────────────
CREATE OR REPLACE FUNCTION bsk.set_queue_counter(p_shift_id smallint, p_value integer)
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = bsk, pg_catalog
AS $$
DECLARE
  v_role bsk.app_role := bsk.current_role();
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('admin', 'receptionist') THEN
    RAISE EXCEPTION 'not authorized to set the queue counter';
  END IF;

  IF p_value < 0 THEN
    RAISE EXCEPTION 'counter value must not be negative';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('bsk:queue_counter')::bigint);

  INSERT INTO bsk.daily_queue_counters (day, shift_id, last_number)
  VALUES ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, p_shift_id, p_value)
  ON CONFLICT (day, shift_id) DO UPDATE SET last_number = EXCLUDED.last_number;
END
$$;

COMMENT ON FUNCTION bsk.set_queue_counter(smallint, integer) IS
  'Manually sets today''s (VN-local) queue counter for a shift. SECURITY DEFINER, '
  'role-gated to admin/receptionist. Advisory-locked against register_checkup''s '
  'concurrent increment.';

-- daily_queue_counters had RLS enabled with no policies (DEFINER-only writes).
-- Staff need to see the current numbers, so add a read-only SELECT policy —
-- writes still only happen through register_checkup() / set_queue_counter().
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'bsk' AND tablename = 'daily_queue_counters'
      AND policyname = 'daily_queue_counters_select_enrolled'
  ) THEN
    CREATE POLICY daily_queue_counters_select_enrolled ON bsk.daily_queue_counters
      FOR SELECT USING (bsk.current_role() IS NOT NULL);
  END IF;
END
$$;

GRANT SELECT ON bsk.daily_queue_counters TO authenticated;  -- no INSERT/UPDATE/DELETE: DEFINER-only
GRANT EXECUTE ON FUNCTION bsk.set_queue_counter(smallint, integer) TO authenticated;

-- ─── (b) checkups.template_values — applied template snapshot ───────────────
ALTER TABLE bsk.checkups ADD COLUMN IF NOT EXISTS template_values jsonb;

COMMENT ON COLUMN bsk.checkups.template_values IS
  'Ordered [{"label": "...", "value": "..."}] snapshot of the applied '
  'checkup_templates.fields, filled in by the doctor. No new RLS policy needed: '
  'the existing checkups_update_clinical policy already covers this column.';
