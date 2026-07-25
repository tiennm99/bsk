-- BSK Phase 4b — prescriptions & billing.
--
-- Attaches medicines (order_items) and services (checkup_services) to a
-- checkup, plus the per-checkup payment state (medicine_orders, keyed by
-- checkup_id — one invoice per visit). Totals are NEVER trusted from the
-- client: save_prescription()/save_checkup_services() snapshot unit_price
-- from the catalogs and compute line_total server-side. All writes go
-- through SECURITY DEFINER RPCs; the tables carry SELECT-only RLS policies.

-- ─── 0. Enum ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  CREATE TYPE bsk.payment_status AS ENUM ('unpaid', 'paid');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

-- ─── 1. order_items (prescribed medicines) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS bsk.order_items (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  checkup_id  bigint      NOT NULL REFERENCES bsk.checkups(id) ON DELETE CASCADE,
  medicine_id bigint      NOT NULL REFERENCES bsk.medicines(id),
  quantity    integer     NOT NULL CHECK (quantity > 0),
  dosage      text,
  unit_price  bigint      NOT NULL CHECK (unit_price >= 0),   -- VND, snapshot at prescribe time
  line_total  bigint      NOT NULL CHECK (line_total >= 0),   -- VND, quantity * unit_price
  notes       text
);

CREATE INDEX IF NOT EXISTS order_items_checkup_idx ON bsk.order_items (checkup_id);

COMMENT ON TABLE bsk.order_items IS
  'Prescribed medicine lines for a checkup. unit_price/line_total are snapshots '
  'computed by bsk.save_prescription() — immune to later catalog price edits.';

-- ─── 2. checkup_services (assigned services) ────────────────────────────────
CREATE TABLE IF NOT EXISTS bsk.checkup_services (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  checkup_id bigint      NOT NULL REFERENCES bsk.checkups(id) ON DELETE CASCADE,
  service_id bigint      NOT NULL REFERENCES bsk.services(id),
  quantity   integer     NOT NULL CHECK (quantity > 0),
  unit_price bigint      NOT NULL CHECK (unit_price >= 0),   -- VND, snapshot at assign time
  line_total bigint      NOT NULL CHECK (line_total >= 0)    -- VND, quantity * unit_price
);

CREATE INDEX IF NOT EXISTS checkup_services_checkup_idx ON bsk.checkup_services (checkup_id);

COMMENT ON TABLE bsk.checkup_services IS
  'Assigned service lines for a checkup. unit_price/line_total are snapshots '
  'computed by bsk.save_checkup_services() — immune to later catalog price edits.';

-- ─── 3. medicine_orders (one payment record per checkup) ────────────────────
CREATE TABLE IF NOT EXISTS bsk.medicine_orders (
  checkup_id     bigint             PRIMARY KEY REFERENCES bsk.checkups(id) ON DELETE CASCADE,
  payment_status bsk.payment_status NOT NULL DEFAULT 'unpaid',
  payment_method text,
  processed_by   uuid               REFERENCES auth.users(id),
  paid_at        timestamptz,
  created_at     timestamptz        NOT NULL DEFAULT now()
);

COMMENT ON TABLE bsk.medicine_orders IS
  'Payment state for a checkup''s invoice (meds + services combined). Row is '
  'created lazily by save_prescription() or mark_order_paid(). Writes only via '
  'the DEFINER RPCs — no client grants beyond SELECT.';

-- ─── 4. save_prescription: replace a checkup''s medicine lines ──────────────
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

COMMENT ON FUNCTION bsk.save_prescription(bigint, jsonb) IS
  'Replaces all order_items for a checkup from a jsonb array of '
  '{medicine_id, quantity, dosage, notes}. unit_price/line_total computed '
  'server-side from bsk.medicines.sale_price. SECURITY DEFINER, clinical-gated. '
  'Ensures a medicine_orders row exists (unpaid) for the checkup.';

-- ─── 5. save_checkup_services: replace a checkup''s service lines ───────────
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

COMMENT ON FUNCTION bsk.save_checkup_services(bigint, jsonb) IS
  'Replaces all checkup_services for a checkup from a jsonb array of '
  '{service_id, quantity}. unit_price/line_total computed server-side from '
  'bsk.services.price. SECURITY DEFINER, clinical-gated.';

-- ─── 6. mark_order_paid: cashier/admin payment ──────────────────────────────
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

  INSERT INTO bsk.medicine_orders (checkup_id, payment_status, payment_method, processed_by, paid_at)
  VALUES (p_checkup_id, 'paid', p_method, auth.uid(), now())
  ON CONFLICT (checkup_id) DO UPDATE
    SET payment_status = 'paid',
        payment_method = EXCLUDED.payment_method,
        processed_by   = EXCLUDED.processed_by,
        paid_at        = EXCLUDED.paid_at;
END
$$;

COMMENT ON FUNCTION bsk.mark_order_paid(bigint, text) IS
  'Marks a checkup''s invoice paid (upsert on checkup_id). SECURITY DEFINER, '
  'gated to admin/cashier only — clinical roles cannot flip payment_status.';

-- ─── 7. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE bsk.order_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE bsk.checkup_services  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bsk.medicine_orders   ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='bsk' AND tablename='order_items' AND policyname='order_items_select_enrolled') THEN
    CREATE POLICY order_items_select_enrolled ON bsk.order_items FOR SELECT USING (bsk.current_role() IS NOT NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='bsk' AND tablename='checkup_services' AND policyname='checkup_services_select_enrolled') THEN
    CREATE POLICY checkup_services_select_enrolled ON bsk.checkup_services FOR SELECT USING (bsk.current_role() IS NOT NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='bsk' AND tablename='medicine_orders' AND policyname='medicine_orders_select_enrolled') THEN
    CREATE POLICY medicine_orders_select_enrolled ON bsk.medicine_orders FOR SELECT USING (bsk.current_role() IS NOT NULL);
  END IF;
END
$$;

-- No INSERT/UPDATE/DELETE policies on any of the three tables: all writes go
-- through the SECURITY DEFINER RPCs above.

-- ─── 8. Grants ───────────────────────────────────────────────────────────────
GRANT SELECT ON bsk.order_items      TO authenticated;
GRANT SELECT ON bsk.checkup_services TO authenticated;
GRANT SELECT ON bsk.medicine_orders  TO authenticated;

GRANT EXECUTE ON FUNCTION bsk.save_prescription(bigint, jsonb)      TO authenticated;
GRANT EXECUTE ON FUNCTION bsk.save_checkup_services(bigint, jsonb)  TO authenticated;
GRANT EXECUTE ON FUNCTION bsk.mark_order_paid(bigint, text)         TO authenticated;
