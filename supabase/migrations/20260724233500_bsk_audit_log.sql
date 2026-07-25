-- BSK audit log (skeleton).
--
-- Append-only record of privileged / clinical mutations. Phase 1 lands the
-- table + a SECURITY DEFINER writer so later phases can log from Server Actions
-- without granting clients direct INSERT. No rows are written yet — call sites
-- arrive with the Phase 2/3 mutations.
--
-- Reads: admin only (RLS). Writes: only via bsk.log_audit() or service_role.

-- ─── 1. Table ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bsk.audit_log (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  action     text        NOT NULL,   -- e.g. 'checkup.update', 'invoice.pay'
  entity     text        NOT NULL,   -- table / domain object name
  entity_id  text,                   -- pk of the affected row (text: mixed pk types)
  details    jsonb,                  -- small, non-PII diff / context
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE bsk.audit_log IS
  'Append-only audit trail of privileged/clinical mutations. Written only via '
  'bsk.log_audit() (SECURITY DEFINER) or service_role. Readable by admin only.';

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON bsk.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx     ON bsk.audit_log (entity, entity_id);

-- ─── 2. RLS ────────────────────────────────────────────────────────────────

ALTER TABLE bsk.audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE  schemaname = 'bsk' AND tablename = 'audit_log'
      AND  policyname = 'audit_log_select_admin'
  ) THEN
    CREATE POLICY audit_log_select_admin
      ON bsk.audit_log
      FOR SELECT
      USING (bsk.current_role() = 'admin');
  END IF;
END
$$;

-- SELECT only for authenticated (RLS narrows to admin). No client writes:
-- INSERT/UPDATE/DELETE flow through the SECURITY DEFINER writer / service_role.
GRANT SELECT ON bsk.audit_log TO authenticated;

-- ─── 3. Writer ─────────────────────────────────────────────────────────────
-- Records the CALLER's auth.uid() as actor. SECURITY DEFINER so callers need
-- no direct INSERT grant; append-only by construction (function only inserts).

CREATE OR REPLACE FUNCTION bsk.log_audit(
  p_action    text,
  p_entity    text,
  p_entity_id text DEFAULT NULL,
  p_details   jsonb DEFAULT NULL
)
  RETURNS void
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path = bsk, pg_catalog
AS $$
  INSERT INTO bsk.audit_log (actor_id, action, entity, entity_id, details)
  VALUES (auth.uid(), p_action, p_entity, p_entity_id, p_details);
$$;

COMMENT ON FUNCTION bsk.log_audit(text, text, text, jsonb) IS
  'Append an audit row attributed to auth.uid(). SECURITY DEFINER: callers need '
  'no direct INSERT on bsk.audit_log. Call from Server Actions on clinical writes.';

GRANT EXECUTE ON FUNCTION bsk.log_audit(text, text, text, jsonb) TO authenticated;
