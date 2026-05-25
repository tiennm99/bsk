-- BSK admin bootstrap: claim_first_admin function.
-- Strategy A: advisory lock + EXISTS-guarded INSERT (serializes concurrent
-- first-sign-in race without the "only one admin ever" constraint of Strategy B).
--
-- Advisory-lock key derivation:
--   SELECT hashtext('bsk:claim_first_admin')::bigint
--   => The key is a stable 64-bit integer derived from the function's fully-
--      qualified logical name.  If you need the exact value for cross-session
--      debugging, run that SELECT in psql — hashtext is deterministic across
--      all PG versions ≥ 9.6.  Using hashtext keeps the value reproducible
--      without hard-coding a magic number.

CREATE OR REPLACE FUNCTION bsk.claim_first_admin(p_user_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  VOLATILE                       -- writes a row; must NOT be STABLE/IMMUTABLE
  SECURITY DEFINER               -- runs as function owner (bypasses caller RLS)
  SET search_path = bsk, pg_catalog
AS $$
DECLARE
  v_inserted boolean := false;
BEGIN
  -- Acquire an exclusive transaction-level advisory lock keyed by
  -- hashtext('bsk:claim_first_admin')::bigint.
  -- This serializes concurrent callers: the second caller blocks here until
  -- the first transaction commits/rolls back, by which point bsk.app_users
  -- is no longer empty and the EXISTS guard below returns false.
  PERFORM pg_advisory_xact_lock(hashtext('bsk:claim_first_admin')::bigint);

  -- EXISTS-guarded INSERT: only insert when the table is empty.
  -- The advisory lock above ensures atomicity across concurrent transactions.
  INSERT INTO bsk.app_users (user_id, role)
  SELECT p_user_id, 'admin'::bsk.app_role
  WHERE  NOT EXISTS (SELECT 1 FROM bsk.app_users);

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION bsk.claim_first_admin(uuid) IS
  'Race-safe first-admin bootstrap. Acquires pg_advisory_xact_lock keyed by '
  'hashtext(''bsk:claim_first_admin'')::bigint, then inserts (user_id, admin) '
  'into bsk.app_users only when the table is empty. Returns true if this caller '
  'claimed admin, false if another caller beat the race. '
  'Called from signInAction when bsk.app_users has zero rows.';

-- Grant EXECUTE to authenticated only (anon cannot trigger first-admin claim).
GRANT EXECUTE ON FUNCTION bsk.claim_first_admin(uuid) TO authenticated;
