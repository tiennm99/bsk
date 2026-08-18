-- BSK — security hardening.
--
-- (a) set_staff_role / remove_staff used the NULL-unsafe guard
--     `IF bsk.current_role() <> 'admin'`: for an authenticated principal with
--     no bsk.app_users row, current_role() is NULL, `NULL <> 'admin'` is NULL,
--     the RAISE is skipped, and the mutation runs. On the shared auth pool an
--     unenrolled sibling-app user could promote an accomplice account to admin
--     or delete staff. Rewritten with the null-safe form used by every other
--     RPC in the schema.
-- (b) Paid-invoice lock was check-then-act with no lock: a cashier marking an
--     order paid concurrently with a clinical re-save of the lines could
--     commit a line rewrite after payment. save_prescription /
--     save_checkup_services / mark_order_paid now serialize on a per-checkup
--     advisory lock.
-- (c) mark_order_paid accepted soft-deleted checkups and zero-line invoices;
--     both now raise.
-- (d) Storage read policy on bsk-checkup-media admitted ANY enrolled role
--     (cashier/patient could enumerate clinical images) while the imaging UI
--     and the checkup_images table are clinical-gated. All four storage
--     policies now use the clinical role set.
-- (e) search_customers: escape LIKE wildcards in the query so a literal
--     '%'/'_' in a patient search does not act as a wildcard.

-- ─── (a) Null-safe admin guards on staff mutations ───────────────────────────
CREATE OR REPLACE FUNCTION bsk.set_staff_role(p_user_id uuid, p_role bsk.app_role)
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = bsk, pg_catalog
AS $$
DECLARE
  v_role bsk.app_role := bsk.current_role();
  v_target_role bsk.app_role;
BEGIN
  IF v_role IS NULL OR v_role <> 'admin' THEN
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
  v_role bsk.app_role := bsk.current_role();
  v_target_role bsk.app_role;
BEGIN
  IF v_role IS NULL OR v_role <> 'admin' THEN
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

-- ─── (b)+(c) Serialized billing writes ───────────────────────────────────────
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

  -- Serialize with mark_order_paid so a line rewrite can never commit after
  -- the invoice was paid (check-then-act below is safe under the lock).
  PERFORM pg_advisory_xact_lock(hashtext('bsk:invoice:' || p_checkup_id::text)::bigint);

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

  PERFORM pg_advisory_xact_lock(hashtext('bsk:invoice:' || p_checkup_id::text)::bigint);

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

CREATE OR REPLACE FUNCTION bsk.mark_order_paid(p_checkup_id bigint, p_method text)
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = bsk, pg_catalog
AS $$
DECLARE
  v_role bsk.app_role := bsk.current_role();
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('admin', 'cashier') THEN
    RAISE EXCEPTION 'not authorized to mark an order paid';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('bsk:invoice:' || p_checkup_id::text)::bigint);

  IF NOT EXISTS (SELECT 1 FROM bsk.checkups WHERE id = p_checkup_id AND NOT deleted) THEN
    RAISE EXCEPTION 'checkup does not exist or is deleted';
  END IF;

  -- A payment needs something to pay for; a zero-line invoice would only
  -- surface later as reconciliation noise in the revenue export.
  IF NOT EXISTS (SELECT 1 FROM bsk.order_items      WHERE checkup_id = p_checkup_id)
     AND NOT EXISTS (SELECT 1 FROM bsk.checkup_services WHERE checkup_id = p_checkup_id) THEN
    RAISE EXCEPTION 'invoice has no line items';
  END IF;

  INSERT INTO bsk.medicine_orders (checkup_id, payment_status, payment_method, processed_by, paid_at)
  VALUES (p_checkup_id, 'paid', p_method, auth.uid(), now())
  ON CONFLICT (checkup_id) DO UPDATE
    SET payment_status = 'paid',
        payment_method = EXCLUDED.payment_method,
        processed_by   = EXCLUDED.processed_by,
        paid_at        = EXCLUDED.paid_at;
END
$$;

-- ─── (d) Clinical-only storage policies on bsk-checkup-media ────────────────
-- The table-level policies (checkup_images) and the imaging UI are already
-- clinical-gated; the object policies must not be broader.
DROP POLICY IF EXISTS bsk_checkup_media_select ON storage.objects;
DROP POLICY IF EXISTS bsk_checkup_media_insert ON storage.objects;
DROP POLICY IF EXISTS bsk_checkup_media_update ON storage.objects;
DROP POLICY IF EXISTS bsk_checkup_media_delete ON storage.objects;

CREATE POLICY bsk_checkup_media_select ON storage.objects FOR SELECT
  USING (bucket_id = 'bsk-checkup-media'
         AND bsk.current_role() IN ('admin', 'receptionist', 'doctor', 'nurse'));

CREATE POLICY bsk_checkup_media_insert ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'bsk-checkup-media'
              AND bsk.current_role() IN ('admin', 'receptionist', 'doctor', 'nurse'));

CREATE POLICY bsk_checkup_media_update ON storage.objects FOR UPDATE
  USING (bucket_id = 'bsk-checkup-media'
         AND bsk.current_role() IN ('admin', 'receptionist', 'doctor', 'nurse'))
  WITH CHECK (bucket_id = 'bsk-checkup-media'
              AND bsk.current_role() IN ('admin', 'receptionist', 'doctor', 'nurse'));

CREATE POLICY bsk_checkup_media_delete ON storage.objects FOR DELETE
  USING (bucket_id = 'bsk-checkup-media'
         AND bsk.current_role() IN ('admin', 'receptionist', 'doctor', 'nurse'));

-- ─── (e) Escape LIKE wildcards in patient search ─────────────────────────────
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
           LIKE '%' || replace(replace(replace(bsk.immutable_unaccent(lower(q)),
                  '\', '\\'), '%', '\%'), '_', '\_') || '%'
      OR COALESCE(phone, '') LIKE '%' || replace(replace(replace(q,
                  '\', '\\'), '%', '\%'), '_', '\_') || '%'
    )
  ORDER BY last_name, first_name
  LIMIT 50
$$;

COMMENT ON FUNCTION bsk.search_customers(text) IS
  'Accent-insensitive patient search by name (or phone substring). SECURITY '
  'INVOKER: runs under the caller RLS. Empty q returns the first 50 patients. '
  'LIKE wildcards in q are escaped — a literal % or _ matches literally.';
