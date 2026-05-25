# Planner Report — BSK Phase 1 (Identity & Access)

**Date:** 2026-05-25
**Plan dir:** `plans/260525-1633-phase-01-identity-access/`
**Status:** PLAN READY (no code yet)

---

## Summary

Phase 1 broken into 7 sub-phases. Total est. effort ~14h. Dependency graph linear with two safe parallel pairs (see below).

| # | Phase | Effort | Hard deps |
|---|---|---|---|
| 01 | DB schema init | 2h | user-action: project provisioned, `ALLOWED_PROJECT_REFS` populated, `supabase link` ran |
| 02 | Auth session wiring | 2h | Phase 01 (for `bsk.current_role()` RPC); scaffold's `lib/supabase/session.ts` |
| 03 | Auth Server Actions | 2h | Phase 01 (RPC), Phase 02 (session helpers) — phase 03 can be authored in parallel with phase 04 page once 02 done |
| 04 | Sign-in page | 2h | Phase 03 (action + schema) |
| 05 | Admin enrollment | 3h | Phase 01–04 (extends `signInAction` + adds invite UI) |
| 06 | Role-gated shell | 2h | Phase 02 (session helper); phase 05 (invite page slots into shell) — can begin once 02 + 05 done |
| 07 | Playwright E2E | 1h | Phases 01–06 fully landed |

Suggested execution: 01 → 02 → (03 ∥ partial 06 component scaffolding) → 04 → 05 → 06 final → 07.

## What's deliberately deferred

- Magic-link sign-in (Open Q #1) — gated on user decision. If "yes", insert a phase 04.5 between 04 and 05; otherwise drop.
- Rate-limit reset hook for E2E (so we can test rate-limit positive case) — pushed to Phase 1.5.
- Storage-state auth reuse in Playwright — premature for one test.
- Trigger-based audit-log writes — Phase 01 ships app-level via `bsk.audit_write()` SECURITY DEFINER helper; trigger-based deferred until mutation surface stabilizes.
- Locale parity linter for i18n catalogs — niche, deferred.
- Vitest unit tests on `next-param.ts`, `claim_first_admin` race semantics — listed in phase 07 "future".

## Open questions surfaced

Carried verbatim in `plan.md`:
1. Magic link in scope or deferred?
2. First-user-admin: advisory lock (recommended) vs partial unique index?
3. Audit log: trigger vs app-level (recommended app-level for skeleton)?
4. Public auth routes locale placement — recommended `[locale]/(auth)/sign-in`?
5. Playwright in this phase or split into 1.5? Plan-default is in-phase.

Two additional surfaces flagged in phase files (decisions baked but flagged for user review):
- Phase 03: rate-limit IP keying vs email keying — chose IP-keyed (standard trade-off).
- Phase 07: E2E target Supabase project — recommended preview, not dev or prod.

## Hard constraints honored in every phase

- Async `params`/`searchParams` — page/layout/route handlers always await.
- `'use cache'` discipline — `createSupabaseServerClient` never called inside cached scope; helpers consume `user`/`role` as args.
- Schema scoping — every DDL is `bsk.*`; ESLint blocks raw `createClient` outside `lib/supabase/*`.
- New Supabase key format only; legacy keys not referenced.
- File-size: target ≤200 LOC per file; phases call out splits if exceeded.
- Form recipe: Zod v4 + RHF + `useActionState` + Server Action — no wrappers.
- proxy.ts: single composed `NextResponse`; cookies merged across next-intl + Supabase via `lib/proxy/copy-cookies.ts`.
- File ownership across parallel phases: no two phases edit the same file simultaneously. (`signInAction` is edited by phase 03 AND phase 05 — sequenced, NOT parallel.)

## Prerequisites checklist for user before phase 01 lands

1. Supabase project provisioned (or shared one available); `project ref` filled into `docs/supabase-shared-config.md`.
2. `scripts/preflight-supabase.ts:23` — `ALLOWED_PROJECT_REFS` populated.
3. `.env.local` populated from `.env.example`; Vercel env vars for `dev/preview/prod` set.
4. Upstash Redis URL + token reachable.
5. `supabase link --project-ref <ref>` ran in repo root.
6. Open Q decisions: magic link, first-admin strategy.

## External research cited

- Supabase Next.js SSR guide — proxy/middleware responsibilities (refresh via `getClaims()`/`getUser()`; set on both `request.cookies` and `response.cookies`).
  - https://supabase.com/docs/guides/auth/server-side/nextjs
  - https://supabase.com/docs/guides/auth/server-side/creating-a-client
- next-intl v4 middleware composition pattern (call `createMiddleware()` inside a custom proxy function, modify the returned response).
  - https://next-intl.dev/docs/routing/middleware
- React 19 `useActionState` signature `(prevState, formData) => newState`; native `<form action>` wraps in Transition.
  - https://react.dev/reference/react/useActionState
- Postgres SECURITY DEFINER STABLE + `SET search_path` hardening; RLS perf via per-statement caching when the helper is STABLE.
  - https://supabase.com/docs/guides/database/postgres/row-level-security
  - https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv
- Playwright config with `webServer` for Next.js dev/start; `projects` for setup dependencies.
  - https://playwright.dev/docs/test-configuration
- Community: Next.js 16 `proxy.ts` rename + Node.js runtime default for proxy.
  - https://medium.com/@securestartkit/next-js-proxy-ts-auth-migration-guide-ff7489ec8735

## Risk hotspots (highlighted across phases)

- **Cookie merge in proxy.ts** (phase 02) — single point of failure. Mitigation: explicit `copyCookies` helper + manual smoke + E2E.
- **First-user race** (phase 05) — advisory-lock approach picked; smoke-test by hitting `claim_first_admin` twice concurrently in `psql`.
- **Open redirect via `next=`** (phase 03) — regex validation with locale-prefix anchor.
- **Auth enumeration via timing** (phase 03) — accepted for educational scope; documented in code comment.
- **Service-role key leak** (phase 05) — only used in `lib/supabase/admin.ts`, ESLint blocks raw `@supabase/supabase-js` outside.
- **`'use cache'` regression** (phase 02, 06) — review checklist; layout has explicit "do NOT add 'use cache'" comment.

## Unresolved questions for user

1. Magic link in Phase 1 scope or deferred? (Default: deferred.)
2. First-user-admin strategy: A (advisory lock, recommended) vs B (partial unique index)?
3. Audit log writes: app-level (recommended for skeleton) vs Postgres triggers?
4. Locale of public auth routes: `[locale]/(auth)/sign-in` recommended — confirm?
5. Playwright in Phase 1 (default) or split into Phase 1.5?
6. E2E target Supabase project: preview (recommended) or a separate test project?
7. `data-testid` attributes on form fields for i18n-stable selectors — confirm naming convention OK?

**Status:** DONE
**Summary:** Plan written at `D:\tiennm99\bsk\plans\260525-1633-phase-01-identity-access\` — `plan.md` overview + 7 phase files; report at `plans/reports/planner-phase-1.md`. 5 open questions carried forward (magic link, first-admin strategy, audit write path, auth route placement, Playwright scope) + 2 additional surfaced (rate-limit keying, E2E target project).
**Concerns:** none blocking — all hard constraints from PLAN.md / CONTRIBUTING.md honored; user-action prerequisites itemized; phase dependency graph linear with clearly named blockers.
