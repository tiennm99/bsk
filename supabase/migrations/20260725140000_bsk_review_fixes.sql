-- BSK — code-review fixes.
--
-- (2) Lock prescriptions/services once an invoice is paid: save_prescription /
--     save_checkup_services now refuse to modify a checkup whose medicine_orders
--     row is 'paid', so a recorded payment can never diverge from the invoice.
-- (4) Race-safe staff mutations: set_staff_role / remove_staff hold an advisory
--     lock while checking the "keep >= 1 admin" invariant, so two concurrent
--     demote/remove operations can't both pass the guard and orphan the clinic.

-- ─── (2) save_prescription — refuse when paid ───────────────────────────────
CREATE OR REPLACE FUNCTION bsk.save_prescription(p_checkup_id bigint, p_items jsonb)
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = bsk, pg_catalog
AS $$
DECLARE
  v_role bsk.app_role := bsk.current_role();
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('admin', 'receptionist', 'doctor', 'nurse') THEN
    RAISE EXCEPTION 'not authorized to save a prescription';
  END IF;

  IF EXISTS (SELECT 1 FROM bsk.medicine_orders WHERE checkup_id = p_checkup_id AND payment_status = 'paid') THEN
    RAISE EXCEPTION 'cannot modify a paid invoice';
  END IF;

  DELETE FROM bsk.order_items WHERE checkup_id = p_checkup_id;

  INSERT INTO bsk.order_items (checkup_id, medicine_id, quantity, dosage, unit_price, line_total, notes)
  SELECT
    p_checkup_id,
    (elem->>'medicine_id')::bigint,
    (elem->>'quantity')::integer,
    NULLIF(elem->>'dosage', ''),
    m.sale_price,
    m.sale_price * (elem->>'quantity')::integer,
    NULLIF(elem->>'notes', '')
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS elem
  JOIN bsk.medicines m ON m.id = (elem->>'medicine_id')::bigint;

  INSERT INTO bsk.medicine_orders (checkup_id) VALUES (p_checkup_id)
  ON CONFLICT (checkup_id) DO NOTHING;
END
$$;

-- ─── (2) save_checkup_services — refuse when paid ───────────────────────────
CREATE OR REPLACE FUNCTION bsk.save_checkup_services(p_checkup_id bigint, p_items jsonb)
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = bsk, pg_catalog
AS $$
DECLARE
  v_role bsk.app_role := bsk.current_role();
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('admin', 'receptionist', 'doctor', 'nurse') THEN
    RAISE EXCEPTION 'not authorized to save checkup services';
  END IF;

  IF EXISTS (SELECT 1 FROM bsk.medicine_orders WHERE checkup_id = p_checkup_id AND payment_status = 'paid') THEN
    RAISE EXCEPTION 'cannot modify a paid invoice';
  END IF;

  DELETE FROM bsk.checkup_services WHERE checkup_id = p_checkup_id;

  INSERT INTO bsk.checkup_services (checkup_id, service_id, quantity, unit_price, line_total)
  SELECT
    p_checkup_id,
    (elem->>'service_id')::bigint,
    (elem->>'quantity')::integer,
    s.price,
    s.price * (elem->>'quantity')::integer
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS elem
  JOIN bsk.services s ON s.id = (elem->>'service_id')::bigint;
END
$$;

-- ─── (4) Race-safe staff mutations ──────────────────────────────────────────
-- Both take pg_advisory_xact_lock so the last-admin check-then-act is serialized.
-- SECURITY DEFINER (write app_users) but gated on the CALLER's current_role().

CREATE OR REPLACE FUNCTION bsk.set_staff_role(p_user_id uuid, p_role bsk.app_role)
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = bsk, pg_catalog
AS $$
DECLARE
  v_target_role bsk.app_role;
BEGIN
  IF bsk.current_role() <> 'admin' THEN
    RAISE EXCEPTION 'not authorized to change staff roles';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot change your own role';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('bsk:staff')::bigint);

  SELECT role INTO v_target_role FROM bsk.app_users WHERE user_id = p_user_id;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'user not enrolled';
  END IF;

  -- Demoting the last admin is forbidden.
  IF v_target_role = 'admin' AND p_role <> 'admin'
     AND (SELECT count(*) FROM bsk.app_users WHERE role = 'admin') <= 1 THEN
    RAISE EXCEPTION 'cannot demote the last admin';
  END IF;

  UPDATE bsk.app_users SET role = p_role WHERE user_id = p_user_id;
END
$$;

CREATE OR REPLACE FUNCTION bsk.remove_staff(p_user_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = bsk, pg_catalog
AS $$
DECLARE
  v_target_role bsk.app_role;
BEGIN
  IF bsk.current_role() <> 'admin' THEN
    RAISE EXCEPTION 'not authorized to remove staff';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot remove yourself';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('bsk:staff')::bigint);

  SELECT role INTO v_target_role FROM bsk.app_users WHERE user_id = p_user_id;
  IF v_target_role IS NULL THEN
    RETURN; -- already gone
  END IF;

  IF v_target_role = 'admin'
     AND (SELECT count(*) FROM bsk.app_users WHERE role = 'admin') <= 1 THEN
    RAISE EXCEPTION 'cannot remove the last admin';
  END IF;

  DELETE FROM bsk.app_users WHERE user_id = p_user_id;
END
$$;

GRANT EXECUTE ON FUNCTION bsk.set_staff_role(uuid, bsk.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION bsk.remove_staff(uuid) TO authenticated;
