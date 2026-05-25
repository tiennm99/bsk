# Phase 02 — Auth Session Wiring

## Context Links
- `PLAN.md` §3.1 (Next.js 16 / `proxy.ts` / `'use cache'`)
- `CONTRIBUTING.md` §2 (`'use cache'` constraints), §3 (Supabase + cache interaction)
- Scout citations:
  - `proxy.ts:1-8` — current next-intl-only middleware
  - `lib/supabase/session.ts:11-14` — JSDoc explicitly tells future-self how to wire this phase (refresh BEFORE next-intl; merge cookies into a single `NextResponse`)
  - `lib/supabase/server.ts:10-34` — per-request server client; correctly outside any cached scope
  - `app/[locale]/layout.tsx:25-47` — current layout reads i18n only; this phase adds session read
- Researcher refs:
  - Supabase docs say proxy must `request.cookies.set` + `response.cookies.set` for refreshed tokens
  - next-intl docs: compose by calling `createMiddleware()` inside a custom `proxy(request)` and modifying the returned response
- Brainstormer F1 in `plans/reports/brainstormer-architecture-redteam.md` — flagged this as the "thing that WILL break" if mishandled

## Overview
- **Priority:** P1 (gates every authenticated route)
- **Status:** pending
- **Brief:** Compose `next-intl/middleware` and `@supabase/ssr` session refresh into a single `proxy.ts`. Read the session in the root `[locale]/layout.tsx` (outside any `'use cache'` scope). Establish the pattern: cookies read at the request entry → user object passed as argument into cached helpers.

## Key Insights
- next-intl's `createMiddleware` returns a `NextResponse`. Supabase's session-refresh helper ALSO needs to read+write cookies on a `NextResponse`. Two separate responses = lost cookies. **Single composed response.**
- Order matters. The recommended order from Supabase docs + community is: (1) build `response = NextResponse.next({ request })`, (2) run Supabase refresh on it (reads incoming cookies, writes refreshed cookies onto BOTH `request.cookies` and `response.cookies`), (3) hand off to next-intl which may produce its own `NextResponse` for redirects/rewrites — at which point we must **port Supabase's cookies onto the next-intl response** before returning.
- `'use cache'` constraint: `createSupabaseServerClient()` reads `cookies()`. It MUST be called at page/layout/Server-Action top-level. The layout reads the user once and passes it down. Cached helpers (none yet in this phase) receive `user` as a function argument, never re-read cookies.
- `lib/supabase/session.ts:39` swallows `auth.getUser()` rejection — that's intentional (transient Supabase outage). Confirmed acceptable per code-reviewer report N6.
- `getUser()` not `getSession()`. `getSession()` returns the JWT without server-side validation; `getUser()` round-trips to Supabase and validates. For server-side auth gating use `getUser()`. (Per Supabase docs.)
- Public routes (`/`, `/sign-in`) must NOT redirect to sign-in. Protected routes (`/dashboard`, `/admin/**`, future feature routes) MUST. The proxy is **not** the authorization layer — it only refreshes the session. Authorization is a layout-level concern (phase 06). The proxy only does the cookie work + a coarse redirect for unauth users hitting protected paths (cheap; defense-in-depth).

## Requirements

### Functional
- F-02-1: `proxy.ts` exports a default async function `proxy(request: NextRequest)`. The matcher unchanged from current (`PLAN: /((?!api|_next|_vercel|.*\\..*).*)`).
- F-02-2: The proxy calls `updateSupabaseSession(request)` (from `lib/supabase/session.ts`) FIRST. This refreshes cookies and returns a `NextResponse` carrying the refreshed `Set-Cookie` headers.
- F-02-3: The proxy then calls next-intl's `handleI18nRouting(request)`. If next-intl returns a redirect/rewrite response, the proxy MUST copy Supabase's refreshed cookies from the first response onto the next-intl response before returning. If next-intl returns a plain `NextResponse.next()`-equivalent, the proxy returns the Supabase response (cookies already attached).
- F-02-4: `lib/supabase/session.ts` exports `updateSupabaseSession(request)` returning `{ response: NextResponse, user: User | null }`. Phase 02 may extend the existing signature (currently returns just `response`); update callers accordingly.
- F-02-5: `lib/supabase/session.ts` exports a constant `PROTECTED_PATH_PREFIXES: ReadonlyArray<string>` = `['/dashboard', '/admin']` (extend in later phases) — a coarse list for the proxy-level "no user → redirect to /sign-in" check. The matcher already excludes `/api`, `_next`, etc.
- F-02-6: When `user === null` AND the path matches a protected prefix (after stripping locale), proxy returns a redirect to `/${locale}/sign-in?next=${encodeURIComponent(originalPath)}`. Locale is detected from path or defaulted to `routing.defaultLocale`.
- F-02-7: `app/[locale]/layout.tsx` reads `const supabase = await createSupabaseServerClient(); const { data: { user } } = await supabase.auth.getUser();` (outside any cached scope), then passes `user` into a `<SessionProvider user={user}>` client wrapper (thin context for client components that need it; phase 06 consumes).
- F-02-8: Add a comment to `app/[locale]/layout.tsx` warning that the `getUser()` call MUST stay outside any `'use cache'` scope and that this layout file MUST NOT have `'use cache'` at the top.

### Non-functional
- N-02-1: Proxy total file under 80 LOC. If composition logic grows, extract `lib/proxy/compose.ts`.
- N-02-2: `updateSupabaseSession` remains the only place that creates a `@supabase/ssr` client from `request`-cookies (ESLint override at `eslint.config.mjs:48-55` already lists `lib/supabase/session.ts` as a permitted importer).
- N-02-3: No new env vars. Reuses `lib/env/server.ts` outputs.
- N-02-4: Performance: proxy must NOT block on more than one Supabase RTT per request. `updateSupabaseSession` already calls `getUser()` exactly once.

## Architecture

### Request flow
```
NextRequest
  │
  ▼
proxy.ts  (single entry; no '_next', no '/api', no dotted paths)
  │
  ├─ 1. response = NextResponse.next({ request })
  │
  ├─ 2. updateSupabaseSession(request)
  │     ├─ creates @supabase/ssr server client with cookie adapter
  │     ├─ writes refreshed Supabase cookies onto BOTH request.cookies + response.cookies
  │     └─ returns { response, user }
  │
  ├─ 3. coarse auth gate:
  │     if !user && pathname matches PROTECTED_PATH_PREFIXES
  │         return NextResponse.redirect('/${locale}/sign-in?next=...')
  │             ← but FIRST copy supabase cookies onto the redirect response
  │
  └─ 4. intlResponse = handleI18nRouting(request)
        if intlResponse is a redirect/rewrite (intlResponse.status !== 200 || has rewrite header)
            copy supabase cookies → intlResponse
            return intlResponse
        else
            return response  (the supabase one — already has cookies)
```

### Cookie-merge helper (pseudocode)
```
function copyCookies(from: NextResponse, to: NextResponse) {
  for (const cookie of from.cookies.getAll())
    to.cookies.set(cookie.name, cookie.value, cookie /* options */)
}
```

### Layout read flow
```
[locale]/layout.tsx (async, no 'use cache')
  ├─ await params  → locale
  ├─ setRequestLocale(locale)
  ├─ supabase = await createSupabaseServerClient()
  ├─ { user } = await supabase.auth.getUser()
  └─ render <NextIntlClientProvider>
              <SessionProvider user={user}>
                {children}
              </SessionProvider>
            </NextIntlClientProvider>
```

## Related Code Files

### Files to modify
- `proxy.ts` — compose Supabase + next-intl per F-02-1..F-02-6. File grows from ~8 LOC to ~50 LOC.
- `lib/supabase/session.ts` — change `updateSupabaseSession` to return `{ response, user }`. Currently returns `NextResponse` (cited at `lib/supabase/session.ts:15-44`). Callers updated in proxy.
- `app/[locale]/layout.tsx` — add session read between `setRequestLocale(locale)` and the JSX return; wrap children in `<SessionProvider>`.

### Files to create
- `lib/proxy/copy-cookies.ts` (~15 LOC) — `copyCookies(from, to)` helper used by `proxy.ts`. Extracted so phase 06 redirect helpers can reuse.
- `lib/auth/session-provider.tsx` (~25 LOC) — thin client component: `'use client'`, `createContext<User | null>`, `useSession()` hook, default `null`. Read in client components in phase 06 (sidebar, sign-out button).
- `lib/auth/get-server-session.ts` (~20 LOC) — server-only helper `async function getServerSession(): Promise<{ user: User | null; role: AppRole | null }>` — called from server components / actions that need both user + role. Combines `createSupabaseServerClient().auth.getUser()` + `bsk.current_role()` RPC. NOT cached (depends on cookies). Used by phase 06 layout.

### Files to delete
- None.

## Implementation Steps
1. Refactor `lib/supabase/session.ts:15-44`: change return type to `{ response, user }`. Capture `data.user` from the `getUser()` call. Keep the swallow-on-error pattern but ensure `user` defaults to `null` on rejection.
2. Author `lib/proxy/copy-cookies.ts`. Pure function, no imports beyond `next/server` types.
3. Rewrite `proxy.ts`:
   - Import `updateSupabaseSession`, `PROTECTED_PATH_PREFIXES` from `lib/supabase/session`, `createMiddleware` from `next-intl/middleware`, `routing` from `i18n/routing`, `copyCookies` from `lib/proxy/copy-cookies`.
   - Build `handleI18nRouting = createMiddleware(routing)` outside the function (module-level) so it isn't rebuilt per request.
   - Inside `proxy(request)`: run Supabase refresh → optional protected-path redirect (with cookie copy) → handoff to next-intl → final cookie copy if next-intl produced its own response.
   - Keep matcher identical to current.
4. Author `lib/auth/session-provider.tsx`. Pure context wrapper. No useEffect, no Supabase calls — just receive the `user` from the server layout.
5. Author `lib/auth/get-server-session.ts`. Uses `createSupabaseServerClient` + RPC call to `bsk.current_role()`. Returns null role if not enrolled.
6. Modify `app/[locale]/layout.tsx`: add `await createSupabaseServerClient()` → `.auth.getUser()` block. Wrap children in `<SessionProvider user={user}>`. Add comment "do NOT add `'use cache'` to this layout — reads cookies()".
7. Confirm phase-01 migration applied (else `bsk.current_role()` RPC in step 5 throws — acceptable, the helper returns `{ user: null, role: null }` in that case).
8. Smoke-test locally:
   - `pnpm dev` → load `/` → no auth required, no redirect.
   - Load `/vi/dashboard` while unauth → redirect to `/vi/sign-in?next=%2Fvi%2Fdashboard`.
   - Browser DevTools → Network → confirm `sb-*` cookies present on the redirect response.
9. `pnpm typecheck` + `pnpm lint` + `pnpm build` (the build is where `'use cache'` misuse fails — confirm it doesn't trip).

## Todo List
- [ ] `lib/supabase/session.ts` returns `{ response, user }`
- [ ] `PROTECTED_PATH_PREFIXES` exported from `lib/supabase/session.ts`
- [ ] `lib/proxy/copy-cookies.ts` authored
- [ ] `proxy.ts` composes Supabase + next-intl with cookie merge
- [ ] `lib/auth/session-provider.tsx` authored
- [ ] `lib/auth/get-server-session.ts` authored
- [ ] `app/[locale]/layout.tsx` reads user; wraps children in SessionProvider; comment forbids `'use cache'`
- [ ] `pnpm typecheck` + `pnpm lint` + `pnpm build` green
- [ ] Manual smoke: unauth → `/dashboard` redirects with cookies intact

## Success Criteria
- Unauth request to a protected path → 307 redirect to `/${locale}/sign-in?next=...`, with `Set-Cookie` headers for refreshed (or unchanged) Supabase cookies attached.
- Authed request to `/` → 200, no redirect, locale chosen correctly by next-intl.
- Authed request to `/dashboard` → 200 (after phase 06 lands the route; in this phase, 404 is acceptable since the route doesn't exist yet — the redirect MUST NOT fire).
- `pnpm build` succeeds — proves no `'use cache'` scope shelters a `cookies()` call.
- `app/[locale]/layout.tsx` has the warning comment and does NOT carry a `'use cache'` directive.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Two `NextResponse` instances → one cookie set lost → user appears signed out on next request | high (if naive) | high | Single composed response via `copyCookies`; F-02-3 explicit |
| `getUser()` round-trips Supabase on every request → latency | med | med | Acceptable; `@supabase/ssr` deduplicates within the same request. Phase 0 review confirmed approach. |
| Supabase Auth outage → all requests fail | low | high | `lib/supabase/session.ts:38-40` swallows `getUser()` error and treats user as null. Acceptable degradation — phase 06 then redirects to sign-in. |
| `'use cache'` accidentally added to layout → build fails | low (visible) | low | Comment in layout; CI runs `next build`; ESLint plugin `@next/eslint-plugin-next` flags some cases |
| next-intl middleware updates change return-shape | low | med | Pin `next-intl` in `package.json` (already at `^4.12.0`); add a comment in `proxy.ts` referencing the composition pattern |
| Coarse-redirect uses wrong locale (path stripping bug) | med | med | `i18n/routing.ts` exports the locales tuple; use it; default to `routing.defaultLocale` when no locale segment matches |
| Edge runtime regression on Supabase | low | high | Brainstormer flagged: proxy is Node.js runtime in Next.js 16+. Confirm in `proxy.ts` (no `export const runtime = 'edge'`) |
| Public `/sign-in` page accidentally triggers a redirect loop | low | high | Protected-prefix check skips `/sign-in`; explicit test in phase 07 E2E |

## Security Considerations
- `getUser()` server-validates the JWT against Supabase Auth on every request. Stronger than `getSession()` which trusts the cookie blob.
- The proxy is **not** the authorization layer (Supabase guidance + brainstormer F8). It refreshes cookies and applies a coarse redirect. True authorization happens at the layout (`(app)/layout.tsx` in phase 06) and via RLS at the DB layer.
- Cookie merge order matters: Supabase MUST set its cookies on the response that is ultimately returned. If next-intl produces a redirect, Supabase cookies port onto it via `copyCookies`. Otherwise the user appears signed-out after the first locale-redirect.
- No secrets logged. The `setAll` swallow in `server.ts:27` and the `getUser()` swallow in `session.ts:39` do not log; F-02 keeps that behavior. Code-reviewer report N5/N6 noted optional dev-only logging — left out of scope for this phase.
- The redirect target uses `next=` query param (raw path-only, validated server-side in phase 03 to reject external URLs).

## Next Steps
- Phase 03 consumes `lib/auth/get-server-session.ts` indirectly (signing in establishes the cookie that this phase reads).
- Phase 04 sign-in page calls `signInAction`; the redirect post-sign-in lands on `/${locale}/dashboard`, which this phase makes the proxy aware of.
- Phase 06 uses `useSession()` from `lib/auth/session-provider.tsx` for client-side sidebar gating; uses `getServerSession()` for server-component gating.
