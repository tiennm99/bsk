# Phase 03 — Auth Server Actions

## Context Links
- `PLAN.md` §4 Phase 1 (sign-in via `useActionState` + Zod v4 + Server Action)
- `CONTRIBUTING.md` §7 (forms recipe — RHF + `useActionState` + Zod, no `next-safe-action`/`zsa`)
- Scout citations:
  - `lib/supabase/server.ts:10-34` — server client used by actions
  - `i18n/navigation.ts:4` — `redirect` from `next-intl/navigation` (locale-aware)
  - `lib/auth/get-server-session.ts` (created in phase 02) — used to identify caller for sign-out audit (deferred until phase 05 if not needed here)
- Researcher refs:
  - React docs on `useActionState`: action signature `(prevState, formData) => newState`
  - Zod v4 shape: `z.object({ email: z.string().email(), password: z.string().min(8) })`

## Overview
- **Priority:** P1 (without these, phase 04 page is non-functional)
- **Status:** pending
- **Brief:** Zod v4 schemas (shared client+server) and the Server Actions `signInAction` + `signOutAction`. Action signature obeys React 19's `useActionState` (prev state + FormData → new state). Re-validates with the same schema on the server. Returns a discriminated-union state for the client to render errors + success states. Post-sign-in, redirects to `/${locale}/dashboard`.

## Key Insights
- Zod schema lives in `lib/auth/schemas.ts` (no `'use server'`). Importable by both client (RHF) and server (action). Same import, same shape, same error messages.
- The Server Action `'use server'` directive lives only in the action file. Schemas stay framework-agnostic.
- `useActionState` does not understand RHF's `onSubmit` flow. The pattern: RHF handles client-side UX (real-time validation, controlled inputs, `formState.errors`), then the form submits via the native `action={dispatch}` prop. Phase 04 implements the wiring.
- Action return shape MUST be JSON-serializable (RSC boundary). No Error objects, no Date, no functions. Use ISO strings + discriminated unions.
- `signInAction` calls `supabase.auth.signInWithPassword({ email, password })`. On success, **before** redirecting, verify the user has a `bsk.app_users` row (i.e., is enrolled). If not, sign them out and return a generic error — defends against shared-`auth.users` enumeration (threat-model R-doc, brainstormer F4).
- Redirect post-sign-in: use `redirect` from `i18n/navigation` to `/${locale}/dashboard` — no `next` query-param plumbing in Phase 1 (original has no URL redirect surface; defer until needed).
- Sign-out is a Server Action that calls `supabase.auth.signOut()` then `redirect('/[locale]/sign-in')`. No FormData consumed; trigger via a `<form action={signOutAction}>` button.

## Requirements

### Functional
- F-03-1: `lib/auth/schemas.ts` exports `SignInSchema` (Zod v4): `{ email: z.string().email(), password: z.string().min(8).max(72) }`. (`72` is bcrypt's effective limit and Supabase's default cap.)
- F-03-2: `lib/auth/schemas.ts` exports `SignInState` type — discriminated union: `{ status: 'idle' } | { status: 'error', fieldErrors: Record<string, string[]>, formError: string | null }`.
- F-03-3: `app/[locale]/(auth)/sign-in/actions.ts` (or `lib/auth/actions/sign-in.ts` — pick one; see Architecture) exports `signInAction(prevState, formData)`.
- F-03-4: `signInAction` flow:
  1. Parse `formData` with `SignInSchema.safeParse`. If fail → return `{ status: 'error', fieldErrors, formError: null }`.
  2. `supabase.auth.signInWithPassword`. If error → return generic `{ status: 'error', fieldErrors: {}, formError: t('invalidCredentials') }` (do NOT distinguish "no user" vs "wrong password").
  3. After success, check enrollment: `await supabase.from('app_users').select('role').eq('user_id', user.id).maybeSingle()`. If no row → `supabase.auth.signOut()` and return the same generic error.
  4. `redirect(\`/${locale}/dashboard\`)` via `i18n/navigation` — this throws a `NEXT_REDIRECT` error that the action runtime handles. Action never returns on the success path.
- F-03-5: `signOutAction` is a parameterless Server Action: call `supabase.auth.signOut()` then `redirect('/${locale}/sign-in')`. Wraps in try/catch logging on failure (acceptable to redirect even on sign-out error — the cookie clearing is local).
- F-03-6: Both actions live behind `'use server'` directive at module top.

### Non-functional
- N-03-1: Actions file ≤ 200 LOC. If `signInAction` grows past ~80 LOC, extract the validation pipeline into `lib/auth/actions/_validate.ts` (still server-only).
- N-03-2: Zero direct `process.env.*` reads in actions; all env goes through `lib/env/server.ts`.
- N-03-3: No `'use cache'` anywhere in this file (Server Actions are inherently uncacheable).
- N-03-4: Error messages reference i18n keys, not literal strings. Server Actions call `getTranslations()` from `next-intl/server` for messages they emit.

## Architecture

### File placement decision
Two choices:
- (a) `app/[locale]/(auth)/sign-in/actions.ts` — co-located with the page.
- (b) `lib/auth/actions/sign-in.ts` — co-located with schemas, importable from anywhere.

Pick **(a)**. Server Actions are coupled to a route's UX contract; co-locating prevents long-distance "what does this action return?" hunts. If a second route ever needs the same action, refactor to (b) at that point. YAGNI.

### Data flow
```
FormData (from client RHF/form)
  │
  ▼
signInAction(prevState, formData)
  ├─ SignInSchema.safeParse(Object.fromEntries(formData))
  │     fail → return { status:'error', fieldErrors }
  ├─ supabase.auth.signInWithPassword
  │     auth fail → return generic { status:'error', formError }
  ├─ enrollment check (bsk.app_users)
  │     missing → signOut + return generic error
  └─ redirect(/${locale}/dashboard)   ← throws NEXT_REDIRECT, never returns
```

### Component interactions
```
sign-in page (phase 04)  ──action={signInAction}──>  signInAction
   ▲                                                    │
   │                                                    ├─ Supabase Auth
   │                                                    ├─ Upstash rate-limit
   │                                                    └─ bsk.app_users (RLS via current_role NOT applied; uses authed-as-self read)
   │
   └── useActionState renders state.status + fieldErrors
```

## Related Code Files

### Files to create
- `lib/auth/schemas.ts` (~50 LOC) — `SignInSchema`, `SignInState` type, `parseSignIn(formData)` helper.
- `app/[locale]/(auth)/sign-in/actions.ts` (~100 LOC) — `signInAction`, `signOutAction`. `'use server'` at top.

### Files to modify
- `messages/vi.json` + `messages/en.json` — add `auth.signIn.*` keys: `emailLabel`, `passwordLabel`, `submit`, `submitting`, `invalidCredentials`, `unenrolledError`, `genericError`.

### Files to delete
- None.

## Implementation Steps
1. Author `lib/auth/schemas.ts`. Zod v4: `z.string().email()` for email, `z.string().min(8).max(72)` for password. Export `SignInState` discriminated union.
2. Author `app/[locale]/(auth)/sign-in/actions.ts`:
   - `'use server'` directive.
   - Import `createSupabaseServerClient` from `lib/supabase/server`.
   - Import `redirect` from `@/i18n/navigation` (locale-aware).
   - `signInAction(prevState: SignInState, formData: FormData): Promise<SignInState>`.
   - Implement F-03-4 step-by-step.
   - Append `signOutAction` per F-03-5.
3. Add i18n strings to `messages/vi.json` + `messages/en.json` under `auth.signIn.*`.
4. Local smoke: rely on phase 04 + manual form test for end-to-end validation.
5. `pnpm typecheck` + `pnpm lint`.

## Todo List
- [ ] `lib/auth/schemas.ts` authored with Zod v4
- [ ] `app/[locale]/(auth)/sign-in/actions.ts` authored with `signInAction` + `signOutAction`
- [ ] i18n keys added under `auth.signIn.*` in both `vi.json` + `en.json`
- [ ] `pnpm typecheck` + `pnpm lint` green
- [ ] Code-reviewer pass on the enrollment check (no early return that skips sign-out on enrollment miss)

## Success Criteria
- `signInAction` returns the documented state shapes for every failure branch.
- Successful sign-in with enrollment → redirect; cookies set by Supabase auth flow.
- Successful sign-in WITHOUT enrollment → sign-out called, generic error returned (NOT a distinct "not enrolled" message — defends against enumeration).
- `signOutAction` clears the session and redirects to `/${locale}/sign-in`.
- Action file is `'use server'`. Schema file is NOT.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Enumeration via "unenrolled" message | med | med | Generic error string for both wrong-password AND unenrolled paths |
| Race: user signs in, enrollment row deleted between sign-in and enrollment check | low | low | Subsequent requests will fail proxy redirect; user re-signs-in; acceptable |
| Action serialization breaks (Date in return) | low | high | Discriminated union has only strings/numbers/booleans; `SignInState` enforces at compile time |
| `redirect()` throws inside try/catch and gets swallowed | high (if naive) | high | Call `redirect()` OUTSIDE any try/catch. React 19/Next.js 16 use a special error symbol; catching it as `unknown` breaks the redirect. |
| Action runs in `'use cache'` (impossible — Server Actions can't be cached) | n/a | n/a | Doc-only note |
| i18n keys missing in one language → runtime warning | low | low | next-intl warns at runtime; CI lint can grep for parity (deferred) |

## Security Considerations
- **Enumeration:** sign-in error wording is generic. Code-path branches that differ in observable timing (e.g., "unenrolled" path triggers a `signOut` round-trip; "wrong password" doesn't) are a side-channel. Mitigation: accept the timing leak for the educational scope; document in code comment.
- **Sign-out:** clears cookies via Supabase SDK. The action MUST NOT reveal user info on completion; redirect-only.
- **Cookies:** the proxy (phase 02) handles refresh; this phase relies on Supabase SDK to set the `sb-*` cookies on sign-in success via `createSupabaseServerClient`'s `setAll` callback.
- **No `service_role` use here.** All actions use the user-context server client (publishable key + cookie). Admin operations live in phase 05.
- **No PII logging.** No `console.log(formData)` or similar — the action either redirects or returns the state.

## Next Steps
- Phase 04 consumes `signInAction` + `SignInState` + `SignInSchema` for the form.
- Phase 05 consumes `signOutAction` in the layout/header for the sign-out button; admin-invite action is a separate Server Action authored in phase 05.
