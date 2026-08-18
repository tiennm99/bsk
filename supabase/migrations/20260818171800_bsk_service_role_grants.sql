-- BSK — table-level grants for service_role.
--
-- The bsk schema only ever granted USAGE to service_role (20260525163300).
-- service_role bypasses RLS but is NOT a superuser: without table grants every
-- PostgREST request made with the secret key fails with "permission denied".
-- That breaks the server-side admin paths and the operator scripts
-- (scripts/seed-geo.mjs, scripts/migrate-from-upstream.mjs, the cron sweep).
--
-- RLS policies are unaffected: service_role skips RLS by design, and the
-- authenticated role's grants/policies stay exactly as they were.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA bsk TO service_role;

-- Tables added by future migrations get the same grants automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA bsk
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
