# Code Review — BSK Phase 0 Scaffold

**Reviewer:** code-reviewer (adversarial pass)
**Date:** 2026-05-25
**Scope:** entire scaffold (~20 files, all read end-to-end)
**Verdict:** **NEEDS FIXES (minor)** — foundation solid, two contradictions and a handful of foot-guns to harden before Phase 1.

---

## Conformance to PLAN §3.1 / §2.7 / CONTRIBUTING

| Rule | Status | Notes |
|---|---|---|
| 1. Async `params` awaited | PASS | `app/[locale]/layout.tsx:32`, `app/[locale]/page.tsx:4` both `await params`. No bare access. |
| 2. `'use cache'` discipline | PASS (with doc bug) | No `'use cache'` scopes yet. Server client has correct JSDoc. See [F3] for contradiction with CONTRIBUTING. |
| 3. Schema scoping (`db: { schema: 'bsk' }`) | PASS | All 4 factories pass it: `client.ts:9`, `server.ts:17`, `admin.ts:12`, `session.ts:22`. |
| 4. New key format | PASS | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` + `SUPABASE_SECRET_KEY` everywhere; no anon / service_role string anywhere. |
| 5. Upstash prefixing | PASS (with caveat) | `withPrefix()` gates every key. `redisKeyPrefix` = `bsk:{NEXT_PUBLIC_APP_ENV}`. See [F2] re: env coupling. |
| 6. Tailwind v4 shape | PASS | `postcss.config.mjs` uses `@tailwindcss/postcss`; `@theme` block in `app/globals.css`; no `tailwind.config.*` file (grep verified). |
| 7. `proxy.ts` not `middleware.ts` | PASS | `proxy.ts:8` matcher `/((?!api|_next|_vercel|.*\\..*).*)` excludes api, next internals, vercel internals, and any path with a dot (static). |
| 8. Env validated once via Zod | PASS | `lib/env/{client,server}.ts` only files reading `process.env.*` (grep verified). |
| 9. TS strictness | PASS+ | `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`. See [N2] for `exactOptionalPropertyTypes`. |
| 10. next-intl wiring | PASS | `vi`+`en`, `vi` default, `as-needed` prefix, unknown locale → `notFound()` (layout.tsx:34-36). |

---

## Findings

### [BLOCKER] — none.

### [HIGH] F1 — `admin.ts` JSDoc contradicts `CONTRIBUTING.md` re: `'use cache'`

- `lib/supabase/admin.ts:8` says: *"NEVER … pass its results through `'use cache'`."*
- `CONTRIBUTING.md:61` says: *"`lib/supabase/admin.ts` does not depend on cookies and is safe to call from cached scopes."*
- These look opposed but the real rule is nuanced: calling it inside a cached scope is fine; caching its **results** is fine only if the cache key correctly partitions on tenant/user inputs. A future contributor reads one of these in isolation and gets it wrong.
- **Fix:** harmonize the wording. Replace admin.ts:8 with: *"Safe to call inside `'use cache'`. Cache key MUST include every input that scopes data access (tenant id, user id) — never cache an admin read keyed only on a constant."*

### [HIGH] F2 — `redisKeyPrefix` depends on `NEXT_PUBLIC_APP_ENV`, which is operator-set and not cross-checked against `NODE_ENV` or Supabase URL

- `lib/env/server.ts:34` computes `bsk:${NEXT_PUBLIC_APP_ENV}`. If a developer runs locally with `NEXT_PUBLIC_APP_ENV=dev` but accidentally pastes a **prod** Upstash REST URL+token into `.env.local`, every key write lands in `bsk:dev:` **on the prod Redis instance** — polluting the shared DB and bypassing the env namespace's intent.
- **Fix:** add a startup assertion that `NEXT_PUBLIC_APP_ENV=prod` ⇔ `NODE_ENV=production`, and surface the Supabase project ref / Upstash host in dev logs at boot so cross-wiring is visible. Cheap to add now; expensive to debug later.

### [HIGH] F3 — `app/layout.tsx` has no `<html>`/`<body>` — root layout contract violation if any path bypasses `[locale]`

- `app/layout.tsx:6` returns bare `{children}`. Standard next-intl pattern (move html/body into `[locale]/layout.tsx:41-46`). Works because:
  - Locale-matched paths render through `[locale]/layout.tsx` (provides html/body).
  - Outside-locale 404 renders through `app/not-found.tsx` which provides its own html/body.
- **Foot-gun:** a future `app/error.tsx` or `app/global-error.tsx` added during Phase 1 incident-response without thinking will get **no html/body** because the root layout doesn't emit them. Next 16 throws a hard error in this case but only at runtime on the error path.
- **Fix:** add a 2-line comment in `app/layout.tsx` warning future contributors that any sibling root file (`error.tsx`, `global-error.tsx`, `loading.tsx`, route handlers) must own its own `<html><body>`, since the root layout doesn't.

### [HIGH] F4 — `lib/upstash.ts` cache key validation is weaker than rate-limit name validation

- `withPrefix()` (line 17-22) only rejects empty or space-containing keys.
- `createRateLimiter()` (line 57) correctly enforces `/^[a-z0-9-]+$/` on `name`.
- A buggy caller passing `cache.set("foo:bar:*\n\r", x)` succeeds and creates a key that breaks `SCAN` patterns and Redis tooling. Worse, `*` in a key looks like a glob in scripts.
- **Fix:** reuse stricter validation for cache keys: `/^[a-z0-9:_-]+$/` (allow colons for sub-namespacing). Throw otherwise.

### [NIT] N1 — `APP_SLUG` and `SUPABASE_SCHEMA` exported from `lib/env/client.ts` are not env vars

- `lib/env/client.ts:24-25` puts two constants in the env module. They're shipped to the browser bundle (harmless — both are public). But they don't belong in an env-parsing file conceptually; if removed later from this file they leave a stale Zod surface.
- **Fix:** move to `lib/constants.ts` (or top of `lib/utils.ts`). Re-export from `lib/env/server.ts:33` becomes a clean import too.

### [NIT] N2 — `exactOptionalPropertyTypes` not enabled

- `tsconfig.json:27` enables `noUncheckedIndexedAccess` (great) but not `exactOptionalPropertyTypes`. Next 16 + React 19 + Zod 4 all play well with it. Skipping means `{ foo?: string }` allows `{ foo: undefined }`, which is the standard footgun when copy-pasting form payloads into Server Actions.
- **Fix:** turn on `exactOptionalPropertyTypes: true` now while there are 0 callers; turning it on after Phase 1 means refactoring dozens of action types.

### [NIT] N3 — `params: Promise<{ locale: string }>` should use the `Locale` union

- `app/[locale]/layout.tsx:30` and `app/[locale]/page.tsx:3` type locale as `string`. The narrowing happens via `hasLocale` at runtime but TS doesn't see it.
- **Fix:** import `type { Locale } from "@/i18n/routing"` and use `Promise<{ locale: Locale }>`. Slightly stronger; doesn't change runtime behavior because `hasLocale` still guards.

### [NIT] N4 — `setRequestLocale` is duplicated by design but comment isn't on `[locale]/layout.tsx`

- `[locale]/page.tsx:7` comment explains the duplication; `[locale]/layout.tsx:38` is silent. A future contributor refactoring the layout removes the call and breaks static rendering.
- **Fix:** mirror the comment to `[locale]/layout.tsx:38`.

### [NIT] N5 — `lib/supabase/server.ts:27` swallows `setAll` errors silently

- Bare `catch {}`. Standard Supabase SSR recipe (the comment explains it). But during a Server Action that legitimately refreshes the session, a real cookie-set failure is now invisible.
- **Fix:** keep the swallow, but log via `console.warn` in dev only (`if (process.env.NODE_ENV !== "production")`).

### [NIT] N6 — `lib/supabase/session.ts:39` swallows `getUser()` rejection

- Same shape. Comment is good. Same dev-only logging suggestion applies.

### [NIT] N7 — `messages/{locale}.json` loaded via dynamic-template-literal import

- `i18n/request.ts:11` uses `await import(\`../messages/${locale}.json\`)`. Turbopack handles this. Bundle size: both `en.json` + `vi.json` get included regardless. Currently 11 lines each, no concern. Note for later as the catalogs grow: switch to a static switch if cold-start matters.

### [NIT] N8 — `.prettierignore:5` ignores `*.md`

- Means PLAN.md / CONTRIBUTING.md / README.md drift in formatting. Harmless; flagging only because the user may want consistency.

---

## Red-Team Foot-Gun Inventory

| Risk | Likelihood | Mitigation |
|---|---|---|
| Contributor copies `createClient` from Supabase docs, omits `{ db: { schema: 'bsk' } }`, queries `public.*` and gets empty results silently | HIGH | ESLint rule banning `@supabase/supabase-js` `createClient` outside `lib/supabase/admin.ts`. Add in Phase 1. |
| Contributor uses `redis.set("foo", ...)` directly bypassing `cache.*` helpers, polluting un-prefixed keys on shared Redis | HIGH | `redis` is currently exported only inside `lib/upstash.ts` (module-private). KEEP IT THAT WAY. Add an ESLint `no-restricted-imports` for `@upstash/redis` outside `lib/upstash.ts`. |
| Operator sets `NEXT_PUBLIC_APP_ENV=prod` but Vercel deploy still points at dev Supabase project | MED | F2 fix (cross-check env coherence at boot). |
| Future PR adds `tailwind.config.ts` "because shadcn told me to" | LOW | Add a `tailwind.config.*` ignore-with-message in repo (or a check in CI). |
| `'use cache'` added to an RSC that internally calls `createSupabaseServerClient` | MED | F1 fix (harmonize docs) + add to ESLint a string-match rule rejecting `createSupabaseServerClient` in files with `"use cache"` directive. |
| `NEXT_PUBLIC_*` containing a secret | LOW | Audited: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is correctly the public sb_publishable_* key. URL is public. APP_ENV is non-secret. Clean. |

---

## Positive Observations

- Env split is textbook: server schema imports client schema, never the inverse; `server-only` correctly placed on every server-only module.
- Module-level `new Redis(...)` in `lib/upstash.ts:12` ensures missing env → boot-time throw, not first-call.
- `withPrefix` is the only path to keys (no exported raw `redis` instance) — exactly the structural enforcement needed for shared-infra namespacing.
- CI uses dummy values for env at build, real secrets only in Vercel — correct.
- `proxy.ts` matcher excludes both `api` and dotted paths (static) — won't double-process.
- `noUncheckedIndexedAccess: true` from day one — much harder to retrofit.
- `lib/supabase/session.ts:11-14` comment explicitly tells future-self how to wire it into `proxy.ts` in Phase 1 — exactly the kind of forward-context-shipping a small team needs.

---

## Recommended Actions (priority order)

1. **F1** — harmonize `admin.ts` JSDoc with CONTRIBUTING re: `'use cache'`. 5-min fix.
2. **F2** — boot-time assertion that `NEXT_PUBLIC_APP_ENV=prod` ↔ `NODE_ENV=production`. 10-min fix.
3. **F3** — add warning comment in `app/layout.tsx`. 2-min fix.
4. **F4** — strengthen `withPrefix` key validation regex. 5-min fix.
5. **N2** — enable `exactOptionalPropertyTypes` now. 1-line fix.
6. **N3** — type `params` with `Locale` union. 2-line fix.
7. **N1**, **N4**, **N5**, **N6**, **N7**, **N8** — polish.
8. (Phase 1 prep, not Phase 0) — ESLint `no-restricted-imports` for `@supabase/supabase-js` and `@upstash/redis` outside their wrapper modules.

---

## Unresolved Questions

- Is `exactOptionalPropertyTypes` intentionally deferred, or oversight? (N2)
- Is `setRequestLocale` duplication in both layout and page intentional per next-intl 4.x static-rendering guide, or copy-paste? Comment in page.tsx suggests intentional — confirm in Phase 1 when adding more pages.
- Should we add a CI step that grep-fails on `process.env.` outside `lib/env/`? Cheap belt-and-suspenders.
