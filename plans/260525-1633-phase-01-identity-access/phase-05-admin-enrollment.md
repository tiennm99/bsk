# Phase 05 — Admin Enrollment

## Context Links
- `PLAN.md` §4 Phase 1 (first user becomes admin; subsequent users invited by admin)
- `docs/threat-model.md` R-doc on shared `auth.users` — invite-only is the policy
- Scout citations:
  - phase 01 outputs: `bsk.app_users`, `bsk.app_role`, `bsk.current_role()`
  - `lib/supabase/admin.ts:14-24` — privileged client (used by admin invite to write into `auth.users`)
  - phase 03 outputs: `signInAction` (the path the invited user takes after receiving credentials)
- Researcher refs:
  - Supabase Admin API: `supabase.auth.admin.inviteUserByEmail(email, { data })` and `supabase.auth.admin.createUser({ email, password, email_confirm })` — service-role required
  - Postgres advisory locks for serialization: `pg_try_advisory_xact_lock(int)` returns boolean, released at txn end

## Overview
- **Priority:** P1
- **Status:** pending
- **Brief:** Two pieces. (a) Race-safe "first user → admin" claim on initial sign-in OR via a one-shot bootstrap script. (b) Admin-only `inviteUserAction` Server Action that creates an `auth.users` row + the matching `bsk.app_users` row with a chosen role.

## Key Insights
- **First-user race:** two simultaneous signups both querying `SELECT count(*) FROM bsk.app_users` see 0, both claim admin. Two race-safe strategies — pick ONE (Open Question #2, flag for user). Documented below:
  - Strategy A — **Advisory lock + SQL function.** `bsk.claim_first_admin(p_user_id uuid)` SECURITY DEFINER takes `pg_advisory_xact_lock(<bsk-namespace-int>)`, then atomically `INSERT INTO bsk.app_users (user_id, role) SELECT $1, 'admin' WHERE NOT EXISTS (SELECT 1 FROM bsk.app_users)`. Returns boolean (true if claimed). Concurrent callers serialize on the lock; only the first inserts.
  - Strategy B — **Partial unique index.** `CREATE UNIQUE INDEX bsk_app_users_single_admin ON bsk.app_users ((true)) WHERE role = 'admin'`. Then a naive `INSERT INTO bsk.app_users (user_id, role) VALUES ($1, 'admin')` from concurrent callers — exactly one succeeds, the rest get a unique-violation error. Strict but constrains forever to "only one admin row" — which is wrong for the steady state (admins can have multiple users in app_role='admin').
  - **Recommendation:** Strategy A. Strategy B confuses "first admin claim" with "only one admin ever". A is one extra SQL function and a clean intent.
- **Bootstrap UX:** during initial setup, no admin exists, so the "invite" flow has no caller. Options:
  - (i) Manual: operator inserts the first `app_users` row via `psql` referring to their own `auth.users.id` after first sign-up (one-time, documented in `docs/runbooks/bootstrap-admin.md`).
  - (ii) Automatic: the first sign-in (when `bsk.app_users` is empty) auto-claims admin via Strategy A inside `signInAction`'s enrollment-check branch.
  - **Recommendation:** (ii) automatic. (i) requires `psql` and the `bsk` schema to be familiar, raises the floor for first-time setup. (ii) makes the docs simpler: "the first person to sign in becomes admin".
- **Invite flow (after first admin exists):**
  - Admin enters email + role on a form.
  - Server Action calls `supabase.auth.admin.inviteUserByEmail(email)` via the admin (service-role) client.
  - On success, insert `bsk.app_users(user_id, role, invited_by)` referencing the newly created `auth.users.id`.
  - Invited user receives Supabase's default invite email; clicks link; sets password; lands on `/sign-in`; signs in; their enrollment row already exists.
- **Email delivery caveat:** Supabase free-tier SMTP is rate-limited (~3/h). Custom SMTP is project-wide and not configured. For educational scope, invite emails may not deliver reliably. Admin can fall back to copying the invite link from the dashboard. Document this in the UI: "Invite sent — if the user doesn't receive the email within 5 minutes, copy the link from Supabase dashboard." This is a known free-tier limitation noted in `docs/supabase-shared-config.md`.
- **`signInAction` change:** the enrollment-check branch (phase 03 F-03-4 step 3) is amended in this phase: if no enrollment AND `bsk.app_users` is empty → call `bsk.claim_first_admin(auth.uid())`. If claim returns true → proceed (enrolled as admin). If returns false → race lost; fall through to the standard "unenrolled" path (sign out + generic error). This is the only place `signInAction` mutates state besides Supabase Auth's own session writes.

## Requirements

### Functional
- F-05-1: SQL function `bsk.claim_first_admin(p_user_id uuid) RETURNS boolean`, SECURITY DEFINER STABLE — no, **VOLATILE** (it writes). `SET search_path = bsk, pg_catalog`. Body: acquires `pg_advisory_xact_lock(<int>)`; inserts admin row if `bsk.app_users` is empty; returns true on insert, false otherwise.
- F-05-2: SQL function `bsk.invite_user(p_email text, p_role bsk.app_role) RETURNS uuid` — NO, this is harder to do purely in SQL because it needs to call `auth.admin.createUser` which is a Supabase Auth API, not a Postgres function. Implement as a **TypeScript-only Server Action** calling the admin SDK. Skip the SQL function.
- F-05-3: `app/[locale]/(app)/admin/invite/actions.ts` exports `inviteUserAction(prevState, formData)` Server Action:
  - Caller-role check: `getServerSession()` → `role === 'admin'` else return `{ status: 'error', formError: 'forbidden' }` (defense in depth; also gated by route layout in phase 06).
  - Validate `formData` with `InviteUserSchema` (`{ email: z.string().email(), role: z.enum(appRoles) }`).
  - `supabaseAdmin.auth.admin.inviteUserByEmail(email)` → on success extract `data.user.id`.
  - `supabase.from('app_users').insert({ user_id: newId, role, invited_by: caller.id })`. Uses admin client (RLS would block authed client because `app_users` has no INSERT policy — by design from phase 01).
  - Return `{ status: 'success', invitedEmail: email }`.
- F-05-4: Migration `20260525130000_bsk_admin.sql` (or append to `bsk_init` if not yet pushed) — creates `bsk.claim_first_admin(uuid)`.
- F-05-5: `signInAction` (phase 03) extended:
  - After `signInWithPassword` success, enrollment check.
  - If no row AND `count(*) = 0` in `bsk.app_users` → call `supabase.rpc('claim_first_admin', { p_user_id: user.id })`.
  - If RPC returns `true` → re-fetch enrollment row → proceed as admin.
  - If RPC returns `false` → fall through to standard sign-out + generic error.
- F-05-6: `app/[locale]/(app)/admin/invite/page.tsx` — admin-only page (phase 06 layout enforces). Renders `<InviteUserForm />` (client) using `useActionState(inviteUserAction)`.
- F-05-7: `app/[locale]/(app)/admin/invite/invite-user-form.tsx` — `'use client'`. Email + role select + submit. Success state shows "Invited" + email. Error state shows formError.

### Non-functional
- N-05-1: `inviteUserAction` ≤ 100 LOC.
- N-05-2: Admin client (`lib/supabase/admin.ts`) used ONLY in this Server Action + future similar admin-tasks. Lint already enforces no raw `@supabase/supabase-js` outside `lib/supabase/*`.
- N-05-3: `claim_first_admin` advisory-lock key is a stable BIGINT — pick a value (e.g., hash of `'bsk:claim_first_admin'` → `'bsk'` schema namespace). Document in SQL comment.
- N-05-4: Audit-write helper from phase 01 is the only write path to `bsk.audit_log`.

## Architecture

### First-admin claim flow
```
signInAction (phase 03 extended)
  │ creds OK
  ▼
SELECT role FROM bsk.app_users WHERE user_id = uid
  │
  ├─ row exists → proceed (cached role)
  └─ no row →
       SELECT count(*) = 0 FROM bsk.app_users
         │
         ├─ false → sign out, generic error
         └─ true  → CALL bsk.claim_first_admin(uid)
                     │ inside SQL function:
                     │   pg_advisory_xact_lock(N)
                     │   IF NOT EXISTS (SELECT 1 FROM bsk.app_users)
                     │       INSERT INTO bsk.app_users (user_id, role) VALUES (uid, 'admin')
                     │       RETURN true
                     │   ELSE RETURN false
                     ▼
                     ├─ true  → re-fetch role → proceed as admin
                     └─ false → sign out, generic error (race lost; retried sign-in shows "unenrolled")
```

### Invite flow
```
admin user opens /[locale]/admin/invite
  │ phase 06 layout: getServerSession() must return role='admin' else 403
  ▼
InviteUserForm submit → inviteUserAction(prev, fd)
  │
  ├─ caller-role recheck (defense in depth)
  ├─ InviteUserSchema.safeParse
  ├─ supabaseAdmin.auth.admin.inviteUserByEmail(email)
  ├─ insert bsk.app_users (admin client; bypasses RLS by design)
  └─ return { status: 'success', invitedEmail }
```

## Related Code Files

### Files to create
- `supabase/migrations/20260525130000_bsk_admin.sql` (~40 LOC) — `bsk.claim_first_admin(uuid)` function + comment.
- `app/[locale]/(app)/admin/invite/actions.ts` (~90 LOC) — `inviteUserAction`. `'use server'`.
- `app/[locale]/(app)/admin/invite/page.tsx` (~30 LOC) — server component renders form.
- `app/[locale]/(app)/admin/invite/invite-user-form.tsx` (~110 LOC) — `'use client'` form.
- `lib/auth/invite-schema.ts` (~25 LOC) — `InviteUserSchema`, `InviteUserState` discriminated union.
- `docs/runbooks/first-admin-setup.md` (~25 LOC) — one-page runbook documenting "first sign-in claims admin via advisory lock; if it goes wrong, see this manual `psql` fallback".

### Files to modify
- `app/[locale]/(auth)/sign-in/actions.ts` — extend the enrollment-check branch per F-05-5.
- `messages/{vi,en}.json` — add `admin.invite.*` keys.
- `types/supabase-bsk.ts` — regenerate after migration apply.
- (Phase 06 will create the `(app)` layout — this phase assumes its existence in the route path; if phase 06 lags, the route just 404s.)

### Files to delete
- None.

## Implementation Steps
1. Pick first-admin strategy (User confirmed: Strategy A advisory lock).
2. Author migration `20260525130000_bsk_admin.sql`:
   - `CREATE OR REPLACE FUNCTION bsk.claim_first_admin(p_user_id uuid) RETURNS boolean ...` with `pg_advisory_xact_lock`, EXISTS-guarded INSERT, returns boolean.
   - Pick advisory-lock key: a constant 64-bit integer derived from `hashtext('bsk:claim_first_admin')::bigint`. Document in comment.
   - `GRANT EXECUTE ON FUNCTION bsk.claim_first_admin(uuid) TO authenticated`.
3. `pnpm db:push` → confirm function exists via `\df bsk.*`.
4. `pnpm db:gen-types` → updates `types/supabase-bsk.ts` with the new RPC.
5. Author `lib/auth/invite-schema.ts` with Zod v4 + `InviteUserState` shape.
6. Author `app/[locale]/(app)/admin/invite/actions.ts`:
   - `'use server'`.
   - `inviteUserAction(prevState, formData)`.
   - Imports: `createSupabaseServerClient` (for caller-role check), `createSupabaseAdminClient` (for `auth.admin.inviteUserByEmail`).
   - Implement F-05-3 flow.
7. Author the page + form per F-05-6 + F-05-7. Same RHF + `useActionState` pattern as phase 04 sign-in.
8. Extend `app/[locale]/(auth)/sign-in/actions.ts` per F-05-5:
   - After `signInWithPassword` success, if enrollment row missing:
     - Read `count(*)` from `bsk.app_users` via the server client.
     - If 0, call `supabase.rpc('claim_first_admin', { p_user_id: user.id })`.
     - On `true`, re-fetch enrollment; proceed as admin.
   - On `false` (or count > 0), continue to sign-out + generic error path.
9. Author `docs/runbooks/first-admin-setup.md` covering the happy path + the manual `psql` fallback (insert into `bsk.app_users` directly).
10. i18n: add `admin.invite.title`, `emailLabel`, `roleLabel`, `submit`, `success`, `errorForbidden`, `errorEmailTaken`, `errorGeneric` to `messages/{vi,en}.json`.
11. `pnpm typecheck` + `pnpm lint` + `pnpm build`.

## Todo List
- [ ] Migration `bsk.claim_first_admin` authored + applied
- [ ] `lib/auth/invite-schema.ts` authored
- [ ] `app/[locale]/(app)/admin/invite/actions.ts` authored
- [ ] `app/[locale]/(app)/admin/invite/page.tsx` + form authored
- [ ] `signInAction` extended with first-admin-claim branch
- [ ] `docs/runbooks/first-admin-setup.md` authored
- [ ] i18n keys added
- [ ] `pnpm typecheck` + `pnpm lint` + `pnpm build` green
- [ ] Manual smoke: from a fresh DB, first sign-in claims admin; invite a second user; the invite arrives (or copy link manually)

## Success Criteria
- Two concurrent first-sign-ins → exactly one becomes admin; the other gets "unenrolled" error. Verified by stressing locally with two browser sessions or by running `bsk.claim_first_admin` in parallel via two `psql` sessions.
- Admin can invite a user with a chosen role; the invited user receives an email (or operator copies invite link).
- Invited user signs in after setting password → lands on dashboard with their role-gated sidebar (phase 06 verifies sidebar).
- Non-admin attempting to load `/[locale]/admin/invite` → 403 / redirect to dashboard (phase 06 layout enforces; this phase's action does a defense-in-depth check).
- `pnpm build` green.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Both concurrent sign-ins become admin (race) | low (if locked) | high | Advisory lock + EXISTS-guarded INSERT inside SECURITY DEFINER function |
| Advisory-lock key collides with sibling app's lock | very low | low | `bsk:` namespaced text hashed; collision probability ~0 across personal projects |
| Supabase invite email doesn't deliver (free-tier SMTP rate limit) | high | med | Document fallback: copy invite link from Supabase dashboard; UX message in invite form |
| Admin invites a user whose email already exists in `auth.users` (sibling app user) | med | low | `inviteUserByEmail` is idempotent for existing users (sends another invite/reset). Just create the `bsk.app_users` row to enroll them. Document in code comment. |
| `inviteUserAction` runs without caller-role recheck → user-with-tampered-cookie can invite | low | high | F-05-3 caller-role recheck; layout-level enforcement; RLS at the DB (insert to `app_users` only via admin client) |
| Manual fallback runbook drifts from actual SQL | low | med | Runbook references the migration filename; PR review checks both updated together |
| `claim_first_admin` not called when `bsk.app_users` becomes empty after admin deletion | low | low | Acceptable edge case; document — "deleting all app_users effectively resets the bootstrap" |
| Service-role secret leaked from invite action | low | catastrophic | Lives only in `lib/supabase/admin.ts`; not passed to client; ESLint blocks raw `@supabase/supabase-js` outside `lib/supabase/*` |

## Security Considerations
- `inviteUserAction` uses the **admin client** (service-role key) — bypasses RLS for the `auth.admin.*` calls AND for the `bsk.app_users` insert. This is the intended design: `bsk.app_users` has NO insert policy, so only admin-client writes succeed.
- Caller-role check is server-side via `getServerSession()`. Client-side gating in phase 06 (sidebar) is UX-only; security is at the server boundary.
- The advisory lock prevents check-then-insert TOCTOU. The lock is held until transaction commit, then released — no leaked lock concerns.
- `claim_first_admin` is restricted to `authenticated` role (GRANT EXECUTE TO authenticated). An anon-key call without sign-in cannot trigger it.

## Next Steps
- Phase 06 enforces `role === 'admin'` at the `(app)/admin` layout level.
- Phase 2+ extends the invite UX: bulk invite, role change, deactivation. Out of scope for this phase.
