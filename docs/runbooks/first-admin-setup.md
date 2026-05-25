# First-Admin Setup Runbook

## Happy Path (automatic)

The first person to successfully sign in when `bsk.app_users` is empty
is automatically granted the `admin` role.

Flow (implemented in `signInAction` + migration `20260525163400_bsk_admin.sql`):

1. User signs in with valid credentials.
2. `signInAction` checks for an enrollment row in `bsk.app_users`.
3. If no row exists, it reads `COUNT(*)` from `bsk.app_users`.
4. If count is 0, it calls `bsk.claim_first_admin(user_id)`.
5. The SQL function acquires `pg_advisory_xact_lock(hashtext('bsk:claim_first_admin')::bigint)`,
   then inserts `(user_id, 'admin')` only if the table is still empty.
6. Returns `true` → sign-in proceeds as admin. Returns `false` (race lost) → generic error.

Two simultaneous first sign-ins: exactly one succeeds; the other receives
"Invalid email or password" and can retry (their next sign-in will find
count > 0 and be rejected as unenrolled until an admin invites them).

## Manual Fallback (psql)

Use this if the automatic claim ever fails or you need to bootstrap
a specific user directly.

```sql
-- 1. Find the user's UUID in auth.users
SELECT id, email FROM auth.users WHERE email = 'your@email.com';

-- 2. Insert the admin enrollment row
INSERT INTO bsk.app_users (user_id, role)
VALUES ('<uuid-from-step-1>', 'admin');
```

Run via Supabase dashboard SQL editor or `psql` with the connection string
from your Supabase project settings.

Note: deleting all rows from `bsk.app_users` effectively resets the
bootstrap — the next sign-in will claim admin again.

## Reference

Migration: `supabase/migrations/20260525163400_bsk_admin.sql`
Sign-in action: `app/[locale]/(auth)/sign-in/actions.ts`
