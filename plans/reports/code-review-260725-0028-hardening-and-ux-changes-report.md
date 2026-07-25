# Code Review — BSK Hardening + UX Pass (re-review)

Date: 2026-07-25
Reviewer: code-reviewer (report-only)
Scope: verify prior findings H1/H2/M1–M4 + audit_log resolved; regression hunt on new code.
Base: prior report `code-review-260724-2243-phase-0-1-foundation-report.md`. All changes uncommitted (working tree).

## Files reviewed
- `supabase/migrations/20260724233400_bsk_admin_allowlist.sql` (new)
- `supabase/migrations/20260724233500_bsk_audit_log.sql` (new)
- `supabase/migrations/20260525163300_bsk_init.sql` (context)
- `app/[locale]/(auth)/sign-in/actions.ts`
- `app/[locale]/(app)/admin/invite/actions.ts`
- `lib/auth/get-server-session.ts`
- `lib/upstash.ts`, `types/supabase-bsk.ts`
- `components/app-shell/{app-shell-frame,app-shell,sidebar,sidebar-nav}.tsx`
- `app/[locale]/(app)/layout.tsx`, `messages/{en,vi}.json`

## Overall
Prior HIGH/MED findings substantially resolved. H1 (the core exploit) is closed cleanly. One HIGH regression introduced by the H2 fix (spoofable rate-limit key) plus a few MED items. No CRITICAL, no RLS bypass, no auth-bypass surface introduced.

---

## Prior-finding verification

### H1 — RESOLVED (verified: migration `20260724233400`)
- `claim_first_admin()` is now no-arg and inserts `auth.uid()` (`:74-76`), never a caller UUID. Old `claim_first_admin(uuid)` dropped (`:41`). Arbitrary-principal selection eliminated.
- Allowlist gate on `lower(auth.jwt() ->> 'email')` (`:52,62-66`). `auth.jwt()` reads the caller's request JWT GUC (`request.jwt.claims`) — unaffected by SECURITY DEFINER; both `auth.jwt()`/`auth.uid()` are schema-qualified so `SET search_path = bsk, pg_catalog` (`:48`) is safe. The email claim is signed by GoTrue; an attacker cannot forge it without controlling the allowlisted inbox (email change requires confirmation). Direct browser `rpc('claim_first_admin')` now gains nothing unless caller is allowlisted → the shared-pool bootstrap window is closed.
- `admin_allowlist`: RLS enabled, zero policies, no table grant to `authenticated` (`:37`, no GRANT). Double-denied to clients. No `ALTER DEFAULT PRIVILEGES` in any migration that would auto-grant SELECT. Contents unreadable. (See L1 for existence disclosure.)
- Empty-table race: advisory lock `pg_advisory_xact_lock` + `NOT EXISTS` inside the lock (`:71-76`) → race-safe; loser gets `ROW_COUNT=0`.
- Casing: `lower()` on both sides (`:52,63`) → no case bypass. Anonymous sign-in (if ever enabled on shared project) carries no email claim → `v_email` null → returns false (`:56`). Good.

### H2 — RESOLVED, but the fix is weakened by a spoofable key. See F1/F2 below.
- `signInLimiter` (login, 5/60s) and `inviteLimiter` (invite, 20/3600s) are now wired and awaited (`sign-in/actions.ts:27,60`; `invite/actions.ts:30,45`). Zero call sites → now two. Invite limiter keys on `session.user.id` (server-derived, not spoofable) — good.

### M1 — RESOLVED
Dead `existingCount` guard removed from `sign-in/actions.ts`; comment (`:96-99`) now correctly explains the guard was inert under caller RLS and the RPC is authoritative.

### M2 — PARTIALLY resolved (product decision, see F4)
Existing-email path now returns `errorEmailTaken` instead of generic (`invite/actions.ts:68-84`). But an existing-but-unenrolled `auth.users` row (sibling-created) still cannot be enrolled through this flow — only the message improved. Detection uses fragile message-substring matching with a `code === "email_exists"` fallback.

### M3 — RESOLVED
Non-`23505` enroll failure on a freshly-created row now rolls back via `deleteUser(newUserId).catch(() => {})` (`invite/actions.ts:100-103`). Errors swallowed; safe. Minor UX note in F5.

### M4 — RESOLVED
`REVOKE INSERT, UPDATE, DELETE ON bsk.app_users FROM authenticated` (`20260724233400:95`). Net effect with init grant (`bsk_init.sql:114`) is SELECT-only for `authenticated`. Depends on migration apply order (233400 after init) — fine.

### audit_log — DELIVERED
`audit_log` table + admin-only SELECT RLS (`20260724233500:40-43`) + `log_audit()` SECURITY DEFINER writer (`:56-70`) with `SET search_path`, inserts `auth.uid()` as actor, append-only by construction, EXECUTE granted to `authenticated`. Shape sound. No call sites yet (intended for Phase 2/3). Types match (`types/supabase-bsk.ts:19-48,99-107`).

---

## New findings

### F1 (HIGH) — Sign-in rate-limit key is client-spoofable → brute-force bypass
`app/[locale]/(auth)/sign-in/actions.ts:59`
```
const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
```
The **leftmost** `x-forwarded-for` value is the client-supplied hop. On Vercel the platform appends the real connecting IP, so `X-Forwarded-For: <attacker-chosen>` becomes `"<attacker-chosen>, <realIP>"` and `split(",")[0]` returns the attacker-controlled value. An attacker rotates that header per request → a fresh 5/60s bucket each time → the limiter never triggers. This defeats the exact shared-Supabase-auth-quota protection that motivated H2 (threat-model R3/R4).
Fix: key on a platform-set, non-spoofable source — Vercel's `x-real-ip` header, or the **last** XFF hop, not the first. Consider also a secondary per-email bucket (looser) so a single account is protected even behind NAT.

### F2 (MEDIUM) — Rate limiter fails closed on Redis outage (auth availability)
`lib/upstash.ts:74-84` + both action call sites.
`Ratelimit.limit()` (v2.0.8) has no `timeout` configured and no internal catch on transport failure (verified in `node_modules/@upstash/ratelimit/dist/index.mjs:799-812`); a Redis/network error rejects the promise. Neither `signInLimiter.limit()` (`sign-in/actions.ts:60`) nor `inviteLimiter.limit()` (`invite/actions.ts:45`) is wrapped in try/catch → the Server Action throws and **all sign-in / invite fails while Redis is down**. Given shared Upstash infra (threat-model R7), a sibling app saturating or killing Redis takes BSK auth offline. Not a security bypass (fail-closed), but make it a deliberate decision: wrap in try/catch and choose fail-open (allow, log) vs. fail-closed (current) explicitly; optionally set a `timeout` on the limiter.

### F3 (MEDIUM) — `getServerSession` now issues 3 sequential round-trips per protected render
`lib/auth/get-server-session.ts:47-86`
Per protected page/layout render it awaits `getUser()` → `rpc("current_role")` → `.from("app_users").select("full_name")`, sequentially. The `current_role` RPC and the `full_name` select both read the caller's own `app_users` row. The own-row SELECT policy (`bsk_init.sql:89-92`) already permits reading `role` directly, so both DB calls collapse into one:
```
.from("app_users").select("role, full_name").eq("user_id", user.id).maybeSingle()
```
This removes a full round-trip on every RSC render — meaningful on the shared connection pool (threat-model R4). Failure handling is otherwise fine (both fall back to null). At minimum run the two DB calls with `Promise.all`.

### F4 (MEDIUM) — M2 enrollment gap remains; brittle string detection
`app/[locale]/(app)/admin/invite/actions.ts:72-84`
`errorEmailTaken` is returned for any invite failure whose message contains "already registered/exists" (or `code === "email_exists"`). Consequences: (a) a user who exists in the shared `auth.users` but has no BSK enrollment can never be enrolled via the UI — admin must go to SQL; (b) message-substring matching is locale/version-fragile and could misclassify unrelated errors as "email taken." If enabling enrollment of pre-existing auth users was the intended M2 fix, it is unresolved — the correct path is admin `getUserById`/`listUsers` → insert `app_users` directly. If deliberately out of scope, document it. (Unresolved Q1.)

### F5 (LOW) — Invite rollback can orphan a live invite link
`invite/actions.ts:100-103`
`inviteUserByEmail` sends the invite email before the enroll; on non-dup enroll failure the user is deleted, but the email (with a now-dead confirmation link) has already been sent. Cosmetic; recipient hits a broken link. Acceptable for educational scope — note only.

### F6 (LOW) — `admin_allowlist` existence disclosure via permission-denied
If schema `bsk` is exposed to PostgREST, an authenticated client calling `.from("admin_allowlist")` receives a permission-denied error rather than an empty result — confirming the table exists (contents stay protected by RLS + no grant). No data leak; note only.

### F7 (LOW / non-issue) — App-shell double-slot sidebar verified safe
`components/app-shell/app-shell-frame.tsx:41,51`
The same server-rendered `sidebar` node is placed in two DOM slots (desktop `hidden md:flex` + mobile drawer). This is a materialized RSC payload — no re-fetch, no double data call. Below `md` the desktop copy is `display:none` (out of the a11y tree); the drawer copy renders only when `open`. SSR renders with `open=false` so only the desktop copy mounts server-side → hydration consistent (verified: `useState(false)` initial). The route-change auto-close uses the render-time state-adjust pattern correctly (`:32-36`). Minor: interactive controls (SignOutButton/LocaleSwitcher/nav) exist twice in the DOM but only one instance is ever visible/focusable. No fix needed.

---

## Verified-correct (risk calibration)
- Next 16: `await headers()` (`sign-in/actions.ts:58`), `await params` (`(app)/layout.tsx`), no `'use cache'` on the cookie-reading session path (explicit warning at layout top). `getUser()` not `getSession()` (`get-server-session.ts:49`). `redirect()` outside try/catch throughout.
- i18n: `tooManyAttempts`, `tooManyRequests`, `openMenu`, `errorEmailTaken`, `errorForbidden`, `errorGeneric`, `invalidCredentials` all present in BOTH `en.json` and `vi.json` — no missing-key regression.
- `log_audit` / `claim_first_admin` / `current_role`: all SECURITY DEFINER with `SET search_path = bsk, pg_catalog`, fully schema-qualified `auth.*` calls — no search-path hijack.
- Invite limiter keyed by `session.user.id` — not spoofable.
- Types (`types/supabase-bsk.ts`) match the two new migrations (no-arg `claim_first_admin`, `admin_allowlist`, `audit_log`, `log_audit`).

## Metrics
- New SECURITY DEFINER functions: 2 (`claim_first_admin` v2, `log_audit`) — both `SET search_path`, both insert `auth.uid()`.
- New tables: 2 (`admin_allowlist`, `audit_log`) — RLS enabled 2/2; client-write grants 0/2.
- Rate-limit call sites: 2 (was 0). Spoofable keys: 1/2 (login).
- Test files: still 0 (Playwright E2E from prior report still not delivered).

## Recommended actions (priority)
1. F1 — key sign-in limiter on `x-real-ip` / last XFF hop (HIGH; the H2 fix is bypassable as-is).
2. F2 — wrap `.limit()` in try/catch with an explicit fail-open/closed decision.
3. F3 — collapse the two `app_users` reads in `getServerSession` into one own-row select.
4. F4 — decide M2 scope: enable existing-auth-user enrollment, or document the gap.
5. F5/F6/F7 — note only; no action required for educational scope.
6. Prior-report leftover: first Playwright E2E (sign-in → role-gated dashboard) still missing.

## Unresolved questions
1. Was M2's intended fix to *enable* enrolling pre-existing shared-pool `auth.users` (admin lookup + direct insert), or only to improve the message? (drives F4)
2. Is auth hard-failing during a Redis outage acceptable, or should the limiter fail open? (drives F2)
3. Deployment target confirmed Vercel for the `x-real-ip` recommendation in F1? (If fronted by a different proxy, the trusted-IP header differs.)

---
Status: DONE_WITH_CONCERNS
Summary: H1 fully closed and H2/M1–M4 + audit_log resolved; but the H2 sign-in limiter keys on a client-spoofable x-forwarded-for value (HIGH — brute-force bypass), plus MED items on Redis fail-closed auth, a redundant session round-trip, and an unresolved M2 enrollment gap.
Concerns/Blockers: F1 should be fixed before this counts as real brute-force protection; confirm F2/F4 product decisions.
