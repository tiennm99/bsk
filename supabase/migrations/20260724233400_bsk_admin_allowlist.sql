-- BSK first-admin bootstrap hardening.
--
-- Replaces the caller-supplied-UUID claim_first_admin(uuid) with an
-- allowlist-gated, auth.uid()-based no-arg function.
--
-- Why: the previous claim_first_admin(p_user_id uuid) was SECURITY DEFINER,
-- EXECUTE-granted to `authenticated`, and trusted a caller-supplied UUID. On the
-- shared, project-wide auth.users pool, any authenticated principal (including a
-- sibling-app user) could pick *who* becomes admin during the empty-table window.
-- This migration:
--   1. gates the claim on the caller's verified email being present in
--      bsk.admin_allowlist (seeded only by the infra owner via SQL),
--   2. inserts auth.uid() — never a caller-supplied id,
--   3. keeps the advisory-lock + EXISTS guard for race safety,
--   4. revokes direct write grants on app_users from `authenticated`
--      (least privilege; all writes go through service_role or SECURITY DEFINER).
--
-- OPERATOR ACTION REQUIRED: seed bsk.admin_allowlist with the intended admin's
-- email BEFORE that person first signs in, e.g.:
--   INSERT INTO bsk.admin_allowlist (email) VALUES ('owner@example.com');

-- ─── 1. Admin allowlist table ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bsk.admin_allowlist (
  email      text        NOT NULL PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE bsk.admin_allowlist IS
  'Emails permitted to self-claim the first admin role via bsk.claim_first_admin(). '
  'Seed rows here (Supabase SQL editor / migration) BEFORE the first admin signs in. '
  'Not readable by authenticated clients — only the SECURITY DEFINER claim function '
  'reads it (as the function owner).';

-- RLS on, no policies + no grants to authenticated: the table is invisible to
-- clients. The claim function is SECURITY DEFINER and reads it as its owner.
ALTER TABLE bsk.admin_allowlist ENABLE ROW LEVEL SECURITY;

-- ─── 2. Replace claim_first_admin ──────────────────────────────────────────

DROP FUNCTION IF EXISTS bsk.claim_first_admin(uuid);

CREATE OR REPLACE FUNCTION bsk.claim_first_admin()
  RETURNS boolean
  LANGUAGE plpgsql
  VOLATILE                       -- writes a row; must NOT be STABLE/IMMUTABLE
  SECURITY DEFINER               -- runs as function owner (bypasses caller RLS)
  SET search_path = bsk, pg_catalog
AS $$
DECLARE
  v_uid      uuid    := auth.uid();
  v_email    text    := lower(nullif(auth.jwt() ->> 'email', ''));
  v_inserted boolean := false;
BEGIN
  -- Caller must be an authenticated principal carrying an email claim.
  IF v_uid IS NULL OR v_email IS NULL THEN
    RETURN false;
  END IF;

  -- The email must be explicitly allowlisted by the infra owner. This closes
  -- the "any authenticated principal can grab admin" hole on the shared pool.
  IF NOT EXISTS (
    SELECT 1 FROM bsk.admin_allowlist a WHERE lower(a.email) = v_email
  ) THEN
    RETURN false;
  END IF;

  -- Serialize concurrent callers: the second caller blocks here until the first
  -- transaction commits, by which point bsk.app_users is no longer empty and the
  -- EXISTS guard below returns false. Key = hashtext('bsk:claim_first_admin').
  PERFORM pg_advisory_xact_lock(hashtext('bsk:claim_first_admin')::bigint);

  -- Claim only when no enrollment exists yet. Insert the CALLER's own id.
  INSERT INTO bsk.app_users (user_id, role)
  SELECT v_uid, 'admin'::bsk.app_role
  WHERE  NOT EXISTS (SELECT 1 FROM bsk.app_users);

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION bsk.claim_first_admin() IS
  'Allowlist-gated first-admin bootstrap. Inserts (auth.uid(), admin) into '
  'bsk.app_users only when the caller''s verified email is in bsk.admin_allowlist '
  'AND the table is empty. Race-safe via pg_advisory_xact_lock. Returns true if '
  'this caller claimed admin, false otherwise. Called from signInAction.';

GRANT EXECUTE ON FUNCTION bsk.claim_first_admin() TO authenticated;

-- ─── 3. Least-privilege on app_users ───────────────────────────────────────
-- `authenticated` never needs direct writes: enrollment happens through the
-- admin (service_role) invite path and the SECURITY DEFINER claim function.
-- RLS already default-denies these, but the grant violated least-privilege.
REVOKE INSERT, UPDATE, DELETE ON bsk.app_users FROM authenticated;
