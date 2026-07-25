-- BSK — one-key "call next patient" for the queue screen.
--
-- bsk.call_next_patient(p_shift_id): picks the lowest queue_number waiting
-- checkup for VN-local "today" + the given shift, marks it in_progress, and
-- returns its id (NULL when the queue is empty). Advisory-locked so two
-- staff clicking "next patient" at the same moment can never grab the same
-- checkup.

CREATE OR REPLACE FUNCTION bsk.call_next_patient(p_shift_id smallint)
  RETURNS bigint
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = bsk, pg_catalog
AS $$
DECLARE
  v_role bsk.app_role := bsk.current_role();
  v_id   bigint;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('admin', 'receptionist', 'doctor', 'nurse') THEN
    RAISE EXCEPTION 'not authorized to call the next patient';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('bsk:call_next')::bigint);

  SELECT id INTO v_id
  FROM bsk.checkups
  WHERE checkup_date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    AND shift_id = p_shift_id
    AND status = 'waiting'
    AND NOT deleted
  ORDER BY queue_number ASC
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE bsk.checkups SET status = 'in_progress' WHERE id = v_id;

  RETURN v_id;
END
$$;

COMMENT ON FUNCTION bsk.call_next_patient(smallint) IS
  'Picks the lowest-queue_number waiting checkup for VN-local today + the '
  'given shift, marks it in_progress, and returns its id (NULL if none '
  'waiting). SECURITY DEFINER, role-gated to clinical staff, advisory-locked '
  'against two staff calling the same patient concurrently.';

GRANT EXECUTE ON FUNCTION bsk.call_next_patient(smallint) TO authenticated;
