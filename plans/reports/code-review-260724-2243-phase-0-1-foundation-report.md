# Code Review — BSK Phase 0 + Phase 1 Foundation

Date: 2026-07-24
Reviewer: code-reviewer (report-only)
Scope: auth/session, admin enrollment/invite, RLS+DB migrations, role gating, proxy/edge, i18n, env.

## Scope
- Migrations: `supabase/migrations/20260525163300_bsk_init.sql`, `..._163400_bsk_admin.sql`
- Auth: `lib/auth/*`, `lib/supabase/{server,client,admin,session}.ts`, `app/[locale]/(auth)/sign-in/*`
- Admin: `app/[locale]/(app)/admin/invite/*`, `app/[locale]/(app)/admin/layout.tsx`
- Gating/shell: `lib/auth/require-role.ts`, `role-menu.ts`, `lib/db/roles.ts`, `components/app-shell/*`
- Infra: `proxy.ts`, `lib/proxy/copy-cookies.ts`, `lib/upstash.ts`, `lib/env/*`, `i18n/*`

## Overall Assessment
Solid, well-commented foundation. Core security invariants hold: RLS enabled on the only table, `current_role()` matches the claimed `SECURITY DEFINER STABLE` shape with a safe `search_path`, secret key is server-only, Redis is prefixed with no KEYS/FLUSHDB, Next 16 async-params + cookies-outside-`'use cache'` rules are respected, and `getUser()` (not `getSession()`) is used for validation. No outright RLS bypass found. The material risks concentrate in the first-admin bootstrap design and a few defense-in-depth gaps. No unresolved CRITICAL exploit under the documented threat model, but two HIGH items warrant a decision before real users.

---

## High Priority

### H1 — First-admin claim: arbitrary principal + whole-project auth pool
`supabase/migrations/20260525163400_bsk_admin.sql:13-40` + `app/[locale]/(auth)/sign-in/actions.ts:84-101`

Two coupled issues:

1. **`claim_first_admin(p_user_id uuid)` trusts a caller-supplied UUID instead of `auth.uid()`.** It is `SECURITY DEFINER` and `GRANT EXECUTE ... TO authenticated` (line 50). Any authenticated user can call it directly (browser client `rpc('claim_first_admin', { p_user_id: <any uuid> })`) — not only via `signInAction`. During the bootstrap window (table empty), the caller chooses *who* becomes admin (themselves or any arbitrary `auth.users` id). The app-layer `existingCount` guard in `actions.ts:84` is irrelevant because the RPC is directly reachable.
2. **The bootstrap window is open to the entire shared `auth.users` pool**, not BSK. Per `docs/threat-model.md`, `auth.users` is project-wide and shared with sibling apps. "First user to sign in becomes admin" means any principal holding valid credentials for *any* sibling app can claim BSK admin while `bsk.app_users` is empty via `signInWithPassword`.

Mitigation status: partially covered by the threat-model assumption that all siblings are invite-only and same-author (`threat-model.md:18-24`). Under that assumption external exploitation is not possible, but the trust boundary crosses apps and the arbitrary-`p_user_id` is a defect regardless of the pool.

Recommendation:
- Derive the principal inside the function: ignore `p_user_id`, `INSERT ... SELECT auth.uid(), 'admin'` (and `WHERE auth.uid() IS NOT NULL`). Removes arbitrary-principal selection.
- Prefer seeding the first admin by an explicit email allowlist / migration seed rather than "first arrival," closing the shared-pool window entirely. If "first arrival" is a deliberate educational choice, document the accepted risk in `threat-model.md` (currently silent on the bootstrap window).

### H2 — No app-layer rate limiting on sign-in or invite
`app/[locale]/(auth)/sign-in/actions.ts`, `app/[locale]/(app)/admin/invite/actions.ts`

`lib/upstash.ts:createRateLimiter` is built and prefixed correctly but never called anywhere (grep: zero call sites). `signInAction` calls `signInWithPassword` with no throttle; brute-force is bounded only by Supabase's project-wide auth limits, which are **shared with sibling apps** — a brute-force on BSK sign-in consumes the shared quota and degrades neighbors (the exact shared-infra blast radius the plan warns about). `inviteUserAction` (which spends free-tier SMTP) is likewise unthrottled.

`CONTRIBUTING.md:103` even shows `bsk:prod:ratelimit:login` as the canonical example, implying intent. Recommend wiring `createRateLimiter("login", …)` keyed by IP/email on `signInAction` and a per-admin limiter on `inviteUserAction`.

---

## Medium Priority

### M1 — Dead `existingCount` optimization in sign-in enrollment check
`app/[locale]/(auth)/sign-in/actions.ts:83-92`

The count query runs under the **user's** RLS. The SELECT policies (`bsk_init.sql:89-106`) expose only the caller's own row or all-rows-if-admin. An unenrolled user therefore sees **0 rows regardless of how many users exist**, so `existingCount === 0` is effectively always true on this path and the RPC is always invoked. The comment ("avoid calling the RPC when other users exist" / "unenrolled non-first user must be rejected without any promotion") is misleading — the guard does nothing. Not a vulnerability (the `NOT EXISTS` guard inside the `SECURITY DEFINER` RPC sees all rows and is authoritative), but the code implies a protection it does not provide. Either drop the count entirely (rely on the RPC returning false) or query via a definer helper that counts all rows.

### M2 — `inviteUserByEmail` re-invite claim is inaccurate
`app/[locale]/(app)/admin/invite/actions.ts:52-58` + comment lines 15-17

The comment claims `inviteUserByEmail` "is idempotent for existing auth.users rows: it resends an invite." In current Supabase, `inviteUserByEmail` returns an error for an already-registered user (email exists), so re-inviting an existing-but-unenrolled user hits `inviteError` → `errorGeneric`, and the `bsk.app_users` insert (the actual enrollment) never runs. An admin trying to enroll a user who already exists in the shared `auth.users` (e.g. created by a sibling app) cannot, and gets a generic error. Consider looking up the existing user (admin `listUsers`/`getUserById`) and enrolling directly when invite reports "already registered," or at minimum correct the comment and surface a distinct message.

### M3 — Partial-failure orphan on invite
`app/[locale]/(app)/admin/invite/actions.ts:53-77`

`inviteUserByEmail` creates the `auth.users` row first; if the subsequent `app_users` insert fails for a non-`23505` reason, the auth row is left orphaned (no enrollment). Harmless for access (an orphan grants nothing), but it accumulates junk in the shared `auth.users` and a later retry may now hit M2. Low blast radius; note for a future compensating cleanup.

### M4 — `GRANT INSERT/UPDATE/DELETE` on `app_users` to `authenticated` contradicts least-privilege
`bsk_init.sql:114-116`

RLS is enabled with **only** SELECT policies, so INSERT/UPDATE/DELETE by `authenticated` are default-denied — verified safe. But granting write privileges that are then fully blocked by RLS is misleading and fragile: if a permissive write policy is ever added to another table by copy-paste, or RLS is ever toggled, these grants become live. Recommend `GRANT SELECT ON bsk.app_users TO authenticated` only (writes go through the `SECURITY DEFINER` path / admin client).

---

## Low Priority

### L1 — Sign-in page bounces unenrolled users through /dashboard
`app/[locale]/(auth)/sign-in/page.tsx` gates on `session?.user`; an authenticated-but-unenrolled user (role null) is redirected to `/dashboard`, where `(app)/layout.tsx:46` signs them out and redirects back to sign-in. Resolves in one bounce (cookie cleared), but gating on `session?.role` here avoids the extra hop.

### L2 — Non-locale-aware redirect in proxy produces an extra hop
`proxy.ts:62-72` uses raw `NextResponse.redirect(/vi/sign-in)`. With `localePrefix: "as-needed"` (`i18n/routing.ts:6`), the default locale `vi` is un-prefixed, so next-intl then redirects `/vi/sign-in` → `/sign-in`. Works, but double-redirect. Minor.

### L3 — Locale/prefix detection via `startsWith` is loose
`proxy.ts:64` (`pathname.startsWith('/'+l)`) and `isProtectedPath` prefix match (`session.ts:13`, `"/admin"`) yield false positives like `/administrator` → treated as protected, `/enigma` → locale "en". None are real routes today; tighten to segment-boundary matching when route surface grows.

### L4 — ESLint factory override is too broad
`eslint.config.mjs:47-56` disables `no-restricted-imports` entirely for the five factory files, so e.g. `lib/supabase/server.ts` could import `@upstash/ratelimit` unnoticed. Also `@supabase/ssr` and `@upstash/qstash` are not restricted anywhere. Scope the override per-file to the one lib each factory legitimately needs.

---

## Verified-Correct (risk calibration)
- `bsk.current_role()` — `SECURITY DEFINER STABLE`, `SET search_path = bsk, pg_catalog`, `auth.uid()` fully schema-qualified: no search-path hijack, no RLS recursion (definer bypasses `app_users` RLS). Matches PLAN §2.2 claim. (`bsk_init.sql:58-68`)
- RLS enabled on `app_users` in the creating migration; both SELECT policies correct (own-row / admin-all). No write policy → default-deny confirmed. (`bsk_init.sql:50,80-108`)
- Advisory-lock + `NOT EXISTS` in `claim_first_admin` correctly serializes the concurrent-first-signin race; loser gets `ROW_COUNT=0`. Race handling is sound (the concern in H1 is *who/which pool*, not the race). (`163400:28-38`)
- Secret key server-only: `SUPABASE_SECRET_KEY` only in `lib/env/server.ts` + `lib/supabase/admin.ts` (both `import "server-only"`); never `NEXT_PUBLIC_*`. Server/browser clients use the publishable key so RLS applies per-user. (`server.ts`, `client.ts`, `admin.ts`)
- Redis: prefix enforced via `withPrefix`/`withScanPattern`; SCAN-only sweeps; key regex forbids glob chars; no KEYS/FLUSHDB/FLUSHALL anywhere. (`lib/upstash.ts`)
- Next 16: `params` awaited in every layout/page; `createSupabaseServerClient` per-request; "do not add `'use cache'`" guards on auth-reading layouts; `getUser()` (validated) not `getSession()`. (`get-server-session.ts:44`, layouts)
- `redirect()` called outside try/catch everywhere (NEXT_REDIRECT symbol not swallowed).
- Env cross-check: `VERCEL_ENV` ↔ `NEXT_PUBLIC_APP_ENV` guard prevents prod creds writing dev keyspace. (`lib/env/server.ts:27-40`)

## Edge Cases Scouted
- Unenrolled user reaching `existingCount` branch → always 0 under RLS (see M1).
- Direct `rpc('claim_first_admin')` bypassing the Server Action (see H1).
- Sibling-app credential reuse during bootstrap window (see H1).
- Unenrolled-user redirect loop through /dashboard → single bounce, terminates (see L1).
- `copyCookies` passing the full `ResponseCookie` as the options arg — extra `name`/`value` keys ignored by `cookies.set`; benign.

## Plan / Task Completeness (Phase 1)
- Present: migration `bsk_init` (app_users, enum, `current_role()`, RLS), sign-in via Supabase Auth (RHF+Zod+`useActionState`), cookie reads in layout outside `'use cache'`, admin enrollment (first-admin claim + invite), role-gated shell. `admin/layout.tsx` already enforces the admin gate (invite `page.tsx` comment saying this is "phase 06" is stale — gate exists now).
- **Missing vs PLAN.md §4 Phase 1:**
  - `bsk.audit_log` skeleton table — not created in any migration.
  - First Playwright E2E (sign-in → role-gated dashboard) — no test files exist at all (Vitest/Playwright). PLAN §7 flags tests as a stated deliverable.

Recommend the lead track audit_log + first E2E as remaining Phase 1 items before Phase 2.

## Recommended Actions (priority order)
1. H1 — harden `claim_first_admin` to use `auth.uid()` and/or seed admin by allowlist; document bootstrap-window risk in threat-model.
2. H2 — wire `createRateLimiter` into sign-in (and invite).
3. M2/M3 — correct invite re-invite handling for existing `auth.users`; fix comment.
4. M1 — remove or fix the dead `existingCount` guard.
5. M4 — reduce `app_users` grants to SELECT for `authenticated`.
6. Deliver missing Phase 1 items: `bsk.audit_log` skeleton + first Playwright E2E.
7. L1–L4 — cleanup when convenient.

## Metrics
- New tables reviewed: 1 (`app_users`) — RLS enabled: 1/1.
- SECURITY DEFINER functions: 2 (`current_role`, `claim_first_admin`) — both `SET search_path`.
- Test coverage: 0 test files present (Phase 1 E2E not delivered).
- Type coverage: strict TS; role tuple guarded against DB enum drift (`lib/db/roles.ts:22`).

## Unresolved Questions
1. Is "first sign-in becomes admin" a deliberate educational shortcut, or should the first admin be seeded by email allowlist? (drives H1 severity/fix)
2. Is `bsk.audit_log` intentionally deferred past Phase 1, or an omission? PLAN §4 lists it under Phase 1.
3. Should sign-in/invite rate limiting land now (shared-quota blast radius) or is it deferred to a later hardening phase?
