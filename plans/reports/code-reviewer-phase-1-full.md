# Phase 1 Full Code Review — Identity & Access

**Scope:** 6 cook commits `0a08f80..9afd68a` on top of `b881470` (Phase 0).
**Verdict:** YES — ready to provision and apply, with 3 NITs and a few TIER 4 notes. Zero BLOCKERs, zero HIGHs found.

---

## TIER 1 — Correctness

### T1-1 — `bsk.claim_first_admin` race-safety [PASS]

`supabase/migrations/20260525163400_bsk_admin.sql:13-40`. Walked two concurrent T1/T2.

- Both call `pg_advisory_xact_lock(hashtext('bsk:claim_first_admin')::bigint)` (line 28). `xact` variant = held until COMMIT/ROLLBACK, **not** session — verified via PG docs naming convention. Correct.
- T1 acquires lock → INSERT … `WHERE NOT EXISTS (SELECT 1 FROM bsk.app_users)` (lines 32-34) inserts 1 row → `GET DIAGNOSTICS ROW_COUNT` (line 36) = 1 → returns true.
- T2 blocks on lock until T1 commits. Upon waking, T2's `EXISTS` subquery now sees T1's row (T1 already committed, T2 sees post-commit snapshot for its own newly started SELECT inside its xact). INSERT inserts 0 rows. `ROW_COUNT` = 0 → returns false.
- `v_inserted boolean := false` (line 21) + `GET DIAGNOSTICS v_inserted = ROW_COUNT` (line 36) — Postgres coerces integer ROW_COUNT to boolean: 0→false, ≥1→true. Standard idiom, correct.
- `VOLATILE` annotation (line 16) correct — `STABLE`/`IMMUTABLE` would forbid the INSERT.
- `SET search_path = bsk, pg_catalog` (line 18) defuses the SECURITY DEFINER hijack.

**Race-safe.** No issue.

### T1-2 — `signInAction` enrollment + first-admin flow [PASS with NIT]

`app/[locale]/(auth)/sign-in/actions.ts:37-122`.

- (a) Wrong pwd → lines 59-65 return `invalidCredentials`, zero DB queries beyond auth. ✓
- (b) Correct, enrolled → lines 73-78 fetch role; `enrollment` truthy → skips block at 79-114 → line 121 redirects to `/${locale}/dashboard`. ✓
- (c) Correct, no enrollment, table non-empty → enters block at 79; line 84 count > 0 → does not enter RPC; falls to 106 signOut + generic error. ✓
- (d) Correct, no enrollment, table empty → count = 0 → RPC → claimed === true → re-fetch → enrollment populated → redirect. ✓
- (e) Two concurrent (d) winners: SQL serializes (T1-1). Winner re-fetches role 'admin' and redirects. Loser sees `claimed === false`, falls through to 106 signOut + generic error. ✓
- `redirect()` at line 121 is at top level of `signInAction`, NOT inside any try/catch. ✓
- Enumeration: wrong-pwd uses `t("invalidCredentials")` (line 63), unenrolled uses same key `t("invalidCredentials")` (line 111). Identical strings. ✓

**[NIT-1]** `actions.ts:73` uses `let { data: enrollment } = await supabase.from("app_users")...` — works because of `let` + `maybeSingle()`. The reassignment at line 100 mutates a destructured binding (legal but slightly unusual). Readability nit; behavior correct.

**[NIT-2]** `actions.ts:84-86` selects `user_id` with `count: "exact", head: true` — `head:true` short-circuits the row payload, so `select("user_id", ...)` is unnecessary. `select("*", { count: "exact", head: true })` is the idiomatic Supabase pattern. Functional but slightly off.

### T1-3 — `proxy.ts` cookie merging [PASS]

`proxy.ts:54-91`.

- Unauth → `/dashboard`: lines 62-73 build a 307 redirect; `copyCookies(supabaseResponse, redirectResponse)` copies any Supabase cookie deltas. Single response returned. ✓
- Authed → `/vi/dashboard`: skips redirect block; reaches line 76 next-intl. Authed user on a locale-prefixed protected path → next-intl returns 200 with no rewrite header → falls to line 90 returning `supabaseResponse` (which has all refreshed sb-* cookies). ✓
- Authed → `/`: with `localePrefix: "as-needed"` and `defaultLocale: "vi"`, next-intl rewrites `/` to `/vi`. Sets `x-middleware-rewrite` header → `isRewrite` (line 81) true → `copyCookies` ports Supabase cookies onto `intlResponse` → return it. ✓
- `copyCookies` (`lib/proxy/copy-cookies.ts:12-16`) iterates `from.cookies.getAll()` and sets onto `to`. NextResponse `cookies.getAll()` returns entries including delete entries (value = ""), so deletes propagate. ✓

**Single-response guarantee held in all three scenarios.**

### T1-4 — RLS on `bsk.app_users` [PASS]

`supabase/migrations/20260525163300_bsk_init.sql:50-108`.

- RLS enabled (line 50). Only two SELECT policies: `app_users_select_own` (lines 89-92, own-row) and `app_users_select_admin` (lines 102-105, admin via `current_role()`). ✓
- No INSERT/UPDATE/DELETE policies → all mutations from `authenticated` role are denied by default (default-deny when RLS is on but no policy matches). ✓
- `current_role()` is SECURITY DEFINER STABLE with `SET search_path` (lines 58-68) → bypasses RLS on `app_users` for the lookup (no recursion), safe from search-path hijack. ✓
- `claim_first_admin` is SECURITY DEFINER (`20260525163400_bsk_admin.sql:17`) → bypasses RLS on INSERT. ✓
- Admin invite uses `createSupabaseAdminClient` (`actions.ts:50`) which uses the secret key → bypasses RLS entirely. ✓

Behavior matches threat-model R1–R3.

### T1-5 — `'use cache'` discipline [PASS]

Grep confirmed: zero `'use cache'` directives in any `.ts`/`.tsx` file. The matches are all WARNING comments in `app/[locale]/layout.tsx:1`, `app/[locale]/(app)/layout.tsx:1`, `app/[locale]/(app)/admin/layout.tsx:1`, `lib/supabase/server.ts:8`, `lib/supabase/admin.ts:10`, `lib/auth/get-server-session.ts:25`, `lib/auth/session-provider.tsx:18`, `app/[locale]/layout.tsx:46`. All cookie-reading scopes are uncached as required.

---

## TIER 2 — Project hard constraints

### T2-6 — Async params [PASS]

Zero hits for `params.locale` (without await). Every page/layout that uses params destructures via `const { locale } = await params;`:
- `app/[locale]/layout.tsx:38`, `app/[locale]/(app)/layout.tsx:32`, `app/[locale]/(app)/admin/layout.tsx:24`, `app/[locale]/(app)/dashboard/page.tsx:13`, `app/[locale]/(auth)/sign-in/page.tsx:17`.

### T2-7 — Schema scoping [PASS]

- Zero `.schema('public')` or `.schema('bsk')` overrides in app code. All `.from("app_users")` calls bind to the schema set in the factory (`db: { schema: SUPABASE_SCHEMA }`).
- `supabase.rpc("current_role")` (`get-server-session.ts:62`) and `supabase.rpc("claim_first_admin", ...)` (`actions.ts:89`) route through the schema-scoped client. PostgREST uses `Accept-Profile: bsk` so the RPC resolves to `bsk.current_role()` / `bsk.claim_first_admin`. ✓

### T2-8 — ESLint guards [PASS]

Raw infra imports limited to allow-listed files:
- `lib/supabase/session.ts:2,5` — `@supabase/ssr`, `@supabase/supabase-js` (User type). On allow-list (`eslint.config.mjs:53`).
- `lib/supabase/{server,client,admin}.ts` — all on allow-list.
- `lib/auth/get-server-session.ts:6` — only a comment string, not an import. ✓

No raw imports outside allow-list.

### T2-9 — Form recipe [PASS]

Both forms follow the recipe precisely:
- `sign-in-form.tsx:37-39` `useActionState(signInAction, { status: "idle" })`, `:43-47` RHF with `zodResolver`, `:79` `<form action={dispatchAction}>` (NOT `onSubmit`).
- `invite-user-form.tsx:40-49` identical shape.

### T2-10 — No banned features [PASS]

Code-side: zero hits for `next=`, `rate*limit`, `audit_write`, `audit_log`, `ratelimit:sign-in`, `playwright`. The only `next=` mentions are in `proxy.ts:38` and `proxy.ts:59` **comments explaining the omission** ("no `?next=` per trimmed plan"). All other hits are in `plans/`, `PLAN.md`, `docs/threat-model.md`, or `pnpm-lock.yaml` (residual `@playwright/test` lockfile entry — see TIER 4).

### T2-11 — File size [PASS]

Largest TS/TSX: `invite-user-form.tsx` 152 LOC, `actions.ts` (sign-in) 146 LOC, `sign-in-form.tsx` 139 LOC. All under 200. ✓

### T2-12 — i18n parity [PASS]

`messages/vi.json` and `messages/en.json` have identical key trees: `home.*`, `errors.*`, `admin.invite.*`, `auth.signIn.*`, `nav.*`, `app.*`, `dashboard.*`. Manually diffed key by key — no drift.

---

## TIER 3 — Security edge cases

### T3-13 — `inviteUserAction` caller-role check [PASS]

`app/[locale]/(app)/admin/invite/actions.ts:32-36` — `getServerSession()` + `session.role === "admin"` check is the FIRST thing after `getTranslations`, before parsing, before any DB call. Direct POST to the action by non-admin returns `errorForbidden` and never touches the admin client. ✓

### T3-14 — `createSupabaseAdminClient()` usage [PASS]

Grep shows only one call site: `app/[locale]/(app)/admin/invite/actions.ts:50`. Phase 1 honors the "admin client = invite-only" boundary. ✓

### T3-15 — Enumeration defense [PASS]

Wrong-pwd path returns `t("invalidCredentials")` (`actions.ts:63`). Unenrolled / failed-claim path returns the same key `t("invalidCredentials")` (`actions.ts:111`). Strings are character-for-character identical in both `vi.json:32` and `en.json:32`. Documented at `actions.ts:8-10` (timing-leak caveat). ✓

### T3-16 — Locale switcher [PASS]

`components/app-shell/locale-switcher.tsx`:
- Line 12: imports `useRouter`, `usePathname` from `@/i18n/navigation` (NOT `next/navigation`). ✓
- Line 22: `nextLocale` is cast to `(typeof routing.locales)[number]` — type-only, no runtime validation, BUT `<option>` values are produced solely from `routing.locales` (line 38) and the type-cast is from a closed enum. No way to inject an arbitrary locale unless the user opens devtools and edits the DOM. Even then, next-intl's `useRouter().replace()` will route through middleware which only recognizes whitelisted locales. No XSS/open-redirect surface. ✓
- Line 23: `router.replace(pathname, { locale: nextLocale })` preserves pathname.

### T3-17 — `requireRole` [PASS]

`lib/auth/require-role.ts:30-38`. Unauthenticated → redirect to `/${locale}/sign-in` (line 31). Wrong role → redirect to `/${locale}/dashboard` (line 37). The dashboard redirect is correct — it sends a doctor who hit `/admin/invite` back to their own landing rather than a 404 (which would confirm the route exists). ✓

### T3-18 — `(app)/layout.tsx` authed-but-no-role edge case [PASS]

`app/[locale]/(app)/layout.tsx:46-51`:
- `await signOutAction()` (line 47) is awaited before any further code. ✓
- `signOutAction` (`actions.ts:135-146`) calls `supabase.auth.signOut()` inside try/catch (cookie clear is local-resilient) then `redirect(...)` OUTSIDE catch (line 145). The Next.js redirect symbol throws past the `await` in (app)/layout — `return null` (layout.tsx:50) is dead at runtime, exists only for control-flow narrowing. ✓
- `try {} catch {}` in signOutAction (lines 138-142) does NOT catch the redirect symbol because `redirect()` is called AFTER the try/catch ends.

---

## TIER 4 — Observations

- **Dead code:** `components/ui/badge.tsx` (46 LOC) and `components/ui/separator.tsx` (28 LOC) installed but unused in Phase 1. Will be used in Phase 2+; leaving in is fine.
- **Native `<select>` for locale switcher and invite role:** functional and accessible but unstyled. Note for Phase 8 polish.
- **Sidebar role badge** is plain `<span>` (`sidebar.tsx:37`) — same Phase 8 polish bucket.
- **`types/supabase-bsk.ts` is hand-written** with header comment noting `pnpm db:gen-types` will overwrite. Matches actual migration shape; safe.
- **`signInAction` does up to 4 round-trips** on the first-admin-claim path (auth + enrollment fetch + count + RPC + re-fetch). Acceptable for a one-time bootstrap; future cleanup could combine the count+RPC into a single SECURITY DEFINER function that returns both `claimed: bool` and `role: app_role`.
- **`pnpm-lock.yaml` retains `@playwright/test`** lockfile entry. Not in `package.json` dependencies — residual from prior install. Cosmetic; will clean on next `pnpm install`.
- **`generateStaticParams`** is exported in `app/[locale]/layout.tsx:27` but the layout itself is dynamic (reads cookies). With no `'use cache'`, Next.js will skip SSG for this scope automatically and use SSR. Harmless but the export is misleading; consider dropping or moving to a leaf static page.
- **`dashboard/page.tsx:13`** awaits `params` without destructuring — `await params;` discards the value. Fine because the page reads locale from `getServerSession()` indirectly; could destructure `{ locale }` for symmetry but not required.
- **`getServerSession`'s outer try/catch on `createSupabaseServerClient()`** (`get-server-session.ts:36-41`) — `createSupabaseServerClient()` only throws if `cookies()` is unavailable (build-time / static gen). The catch correctly returns null. ✓

---

## Behavioral checklist

- [x] Concurrency: advisory-lock + EXISTS-guarded INSERT is race-safe (T1-1).
- [x] Error boundaries: redirect symbols never caught; transient errors return null/generic; no swallowed exceptions on critical paths.
- [x] API contracts: SignInState / InviteUserState discriminated unions JSON-serializable.
- [x] Backwards compat: no exports renamed.
- [x] Input validation: Zod parses FormData at every Server Action boundary.
- [x] Auth/authz: every sensitive op checks (a) session AND (b) role; admin gate is defense-in-depth at action + layout + admin-client usage.
- [x] N+1 / query efficiency: at most 4 round-trips on the worst path (first-admin claim, one-time).
- [x] Data leaks: enumeration defense in place; no PII logged; no stack traces returned to client.
- [x] Fact-checked: every `path:line` cited above was grep-verified.

---

## Recommended Actions

1. **(NIT-1)** Convert `let enrollment = ...` to a small local helper or reassign via clearer variable in `actions.ts:73`. Cosmetic.
2. **(NIT-2)** Use `select("*", { count: "exact", head: true })` at `actions.ts:84` instead of `select("user_id", ...)`. Cosmetic.
3. **(TIER 4)** Run `pnpm install` once after merge to drop `@playwright/test` from `pnpm-lock.yaml`.

None of these block provisioning. Apply migrations and proceed.

---

## Verdict

**YES — ready to provision and apply.** All TIER 1–3 checks pass. Two cosmetic NITs do not gate merge.

## Unresolved Questions

None. The diff matches the trimmed plan exactly: no `next=`, no rate-limit, no audit log, no Playwright. The race-safety, RLS posture, enumeration defense, admin-client containment, and cookie merging are all sound.
