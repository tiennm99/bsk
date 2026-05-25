-- BSK schema initialisation
-- Creates the bsk schema, role enum, app_users enrollment table,
-- current_role() helper function, and RLS policies.
--
-- All objects are schema-qualified to bsk.* — never public.*.
-- RLS is enabled in the same statement that creates each table (project policy).
--
-- Idempotency: safe to re-apply on a half-applied state.
-- The app_users.user_id FK carries ON DELETE CASCADE so that removing an
-- auth.users row (account deletion) also removes the BSK enrollment row.

-- ─── 0. Schema ───────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS bsk;

-- ─── 1. Role enum ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  CREATE TYPE bsk.app_role AS ENUM (
    'admin',
    'doctor',
    'nurse',
    'receptionist',
    'cashier',
    'patient'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- ─── 2. Enrollment table ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bsk.app_users (
  user_id    uuid        NOT NULL PRIMARY KEY
               REFERENCES auth.users(id) ON DELETE CASCADE,
  role       bsk.app_role NOT NULL,
  full_name  text,
  invited_by uuid        REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE bsk.app_users IS
  'BSK enrollment gate. Existing in auth.users grants nothing — '
  'a row here is required for any BSK access.';

-- ─── 3. Enable RLS (same migration, project policy) ──────────────────────────

ALTER TABLE bsk.app_users ENABLE ROW LEVEL SECURITY;

-- ─── 4. current_role() helper ────────────────────────────────────────────────
-- SECURITY DEFINER so the function runs as its owner and can bypass RLS on
-- the role-lookup itself (prevents recursion). STABLE enables per-statement
-- plan caching (Supabase RLS perf pattern). SET search_path defuses the
-- standard search-path hijack against SECURITY DEFINER functions.

CREATE OR REPLACE FUNCTION bsk.current_role()
  RETURNS bsk.app_role
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = bsk, pg_catalog
AS $$
  SELECT role
  FROM   bsk.app_users
  WHERE  user_id = auth.uid();
$$;

COMMENT ON FUNCTION bsk.current_role() IS
  'Returns the BSK role for the currently-authenticated user, or NULL if '
  'not enrolled. SECURITY DEFINER + STABLE: safe from search-path hijack '
  'and eligible for per-statement plan caching by the Postgres planner.';

-- ─── 5. RLS policies ─────────────────────────────────────────────────────────
-- SELECT: own row OR admin.
-- INSERT / UPDATE / DELETE: no direct policy — mutations go through
-- bsk.invite_user() (phase 05) which runs as SECURITY DEFINER.

DO $$
BEGIN
  -- Own-row select policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE  schemaname = 'bsk'
      AND  tablename  = 'app_users'
      AND  policyname = 'app_users_select_own'
  ) THEN
    CREATE POLICY app_users_select_own
      ON bsk.app_users
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  -- Admin select policy (admin sees all rows)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE  schemaname = 'bsk'
      AND  tablename  = 'app_users'
      AND  policyname = 'app_users_select_admin'
  ) THEN
    CREATE POLICY app_users_select_admin
      ON bsk.app_users
      FOR SELECT
      USING (bsk.current_role() = 'admin');
  END IF;
END
$$;

-- ─── 6. Grants ────────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA bsk TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON bsk.app_users
  TO authenticated;

GRANT EXECUTE ON FUNCTION bsk.current_role() TO authenticated;
