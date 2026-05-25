# Phase 04 — Sign-In Page

## Context Links
- `PLAN.md` §4 Phase 1 (sign-in form via RHF + Zod v4 + `useActionState`)
- `CONTRIBUTING.md` §7 (form recipe — NO `next-safe-action`/`zsa`)
- Scout citations:
  - `app/[locale]/layout.tsx:25-47` — locale layout (extended in phase 02 with `SessionProvider`)
  - `i18n/navigation.ts:4` — `Link`, `redirect`, `useRouter` from next-intl
  - `messages/{vi,en}.json` — i18n catalog (phase 03 adds `auth.signIn.*` keys)
  - phase 03 outputs: `SignInSchema`, `SignInState`, `signInAction`
- shadcn/ui components: `Input`, `Label`, `Button`, `Form` primitives (CLI v4) + `Sonner` for toasts

## Overview
- **Priority:** P1
- **Status:** pending
- **Brief:** Public sign-in page at `/[locale]/sign-in`. Client component using `react-hook-form` for UX (inline validation, controlled inputs, disabled-submit-while-pending) and `useActionState` to call `signInAction` via the native `<form action>` prop. Renders shadcn primitives + i18n strings + Sonner toasts. Belongs to the `(auth)` route group so it has a distinct layout (centered, no sidebar).

## Key Insights
- `(auth)` route group: `app/[locale]/(auth)/layout.tsx` is a minimal layout (no sidebar — just brand + content). Bypasses the phase 06 `(app)` layout that requires auth.
- RHF + `useActionState` integration shape (from researcher refs + Next.js community pattern):
  1. RHF owns form state (`useForm({ resolver: zodResolver(SignInSchema) })`).
  2. `useActionState(signInAction, initialState)` returns `[state, dispatchAction, isPending]`.
  3. Form `action` prop bound to `dispatchAction`. RHF's `handleSubmit` NOT used here — the native form action dispatches the FormData directly. RHF's role is to surface inline errors via `formState.errors` BEFORE submit (client validation), but submission goes through the React 19 form action mechanism.
  4. Server-returned field errors (from `state.fieldErrors`) merge into RHF errors via `useEffect(() => state.fieldErrors && form.setError(...))`. UX: client errors first, server errors as a fallback.
- Native `<form action={dispatchAction}>` automatically wraps submission in a Transition; `isPending` flag is the source of truth for the loading state.
- Sonner used only for transient toasts (rate-limit message, "signed out" confirmation on the post-redirect landing page in phase 06). Inline form errors via RHF + `state.formError` text. No toast for invalid creds — keeps the error near the form.
- The page accepts `?next=` query param (Promise<{ next?: string }> per Next.js 16 async searchParams), renders it as a hidden `<input name="next">` so the action sees it in `FormData`.

## Requirements

### Functional
- F-04-1: `app/[locale]/(auth)/layout.tsx` — centered card layout, no sidebar, app brand at top. Does not call `getServerSession()` (public route). Async; awaits `params`.
- F-04-2: `app/[locale]/(auth)/sign-in/page.tsx` — server component. Awaits `params` + `searchParams`. Validates `next` shape client-side too (defense in depth). Renders `<SignInForm next={next} />` (client component).
- F-04-3: `app/[locale]/(auth)/sign-in/sign-in-form.tsx` — `'use client'`. The form component. Uses:
  - `useForm` from `react-hook-form` with `zodResolver(SignInSchema)`.
  - `useActionState(signInAction, { status: 'idle' })`.
  - shadcn `Input`, `Label`, `Button`.
  - `useTranslations('auth.signIn')` from `next-intl`.
  - Renders email + password + hidden `next` + submit button.
- F-04-4: Form submit binds `<form action={dispatchAction}>`. NO `onSubmit={form.handleSubmit(...)}`.
- F-04-5: When `state.status === 'error'` and `state.formError` is set, render the form-level error above the submit button (red, role="alert").
- F-04-6: When `state.status === 'rate_limited'`, render the rate-limit message with `retryAfterSeconds` interpolated.
- F-04-7: When server `fieldErrors` arrive, sync them into RHF via `useEffect` so the inline error UI is consistent.
- F-04-8: Submit button disabled when `isPending || !form.formState.isValid`. Button label switches to the `submitting` i18n string when `isPending`.
- F-04-9: Already-signed-in users hitting `/[locale]/sign-in` are redirected to `/[locale]/dashboard`. Implementation: `page.tsx` calls `getServerSession()`; if `user` not null → `redirect('/${locale}/dashboard')`.

### Non-functional
- N-04-1: Page + form file together ≤ 200 LOC. Form file ≤ 150 LOC.
- N-04-2: No `next-safe-action` / `zsa` / `safe-action` imports.
- N-04-3: No Supabase client imports in client component (form uses Server Action only).
- N-04-4: shadcn components installed via CLI: `pnpm dlx shadcn@latest add input label button form sonner`. Files land under `components/ui/`.
- N-04-5: Sonner `<Toaster />` mounted once at the `(app)`/`(auth)` layout shared ancestor; for this phase, add to `app/[locale]/layout.tsx` (single global mount).

## Architecture

### Route tree (after this phase + phase 06)
```
app/
└─ [locale]/
   ├─ layout.tsx              (i18n + session provider + Toaster)
   ├─ page.tsx                (existing home)
   ├─ (auth)/
   │  ├─ layout.tsx           (centered, no sidebar)
   │  └─ sign-in/
   │     ├─ page.tsx          (server, awaits params/searchParams)
   │     ├─ sign-in-form.tsx  ('use client')
   │     └─ actions.ts        (from phase 03; 'use server')
   └─ (app)/                  (phase 06)
      ├─ layout.tsx           (requires auth)
      └─ dashboard/page.tsx   (phase 06)
```

### Form data flow
```
User types
  │
  ▼
RHF onChange → form.formState.errors (client-side Zod)
  │
  │ submit
  ▼
<form action={dispatchAction}>
  │  (React 19 wraps in Transition; isPending=true)
  ▼
signInAction(prevState, formData)   (phase 03)
  │
  ▼
returns SignInState
  │
  ▼
useActionState re-renders
  │
  ├─ state.status === 'error' → render formError, sync fieldErrors into RHF
  ├─ state.status === 'rate_limited' → render rate-limit banner
  └─ (success path never returns; action redirects)
```

## Related Code Files

### Files to create
- `app/[locale]/(auth)/layout.tsx` (~30 LOC)
- `app/[locale]/(auth)/sign-in/page.tsx` (~40 LOC)
- `app/[locale]/(auth)/sign-in/sign-in-form.tsx` (~140 LOC client component)
- `components/ui/{input,label,button,form,sonner}.tsx` — generated by shadcn CLI; do not hand-edit.

### Files to modify
- `app/[locale]/layout.tsx` — mount `<Toaster />` from `sonner` once globally (inside `NextIntlClientProvider`).
- `messages/vi.json` + `messages/en.json` — keys added in phase 03 (re-verify present).
- `components.json` — created by shadcn init in phase 0; verify settings (alias, RSC=true).

### Files to delete
- None.

## Implementation Steps
1. Install shadcn primitives: `pnpm dlx shadcn@latest add input label button form sonner`. Confirm files land in `components/ui/`.
2. Mount Sonner `<Toaster richColors position="top-right" />` in `app/[locale]/layout.tsx` inside `NextIntlClientProvider` and outside `SessionProvider` (toast events are user-agnostic).
3. Author `app/[locale]/(auth)/layout.tsx`. Minimal: centered flex container, brand at top, `{children}`. Async function awaits `params`.
4. Author `app/[locale]/(auth)/sign-in/page.tsx`. Async server component:
   - Awaits `params` (Locale) and `searchParams` ({ next?: string }).
   - Calls `getServerSession()` from phase 02. If user exists → `redirect('/${locale}/dashboard')`.
   - Renders `<SignInForm next={searchParams.next ?? ''} />`.
5. Author `app/[locale]/(auth)/sign-in/sign-in-form.tsx`:
   - `'use client'`.
   - `useForm<{ email: string, password: string }>({ resolver: zodResolver(SignInSchema), mode: 'onBlur' })`.
   - `useActionState(signInAction, { status: 'idle' })`.
   - `useEffect` to mirror `state.fieldErrors` → `form.setError(...)`.
   - `useEffect` to call `toast.error(t('rateLimited', { seconds }))` when status flips to `rate_limited` (so the message hangs around even on re-render).
   - JSX: `<form action={dispatchAction}>` containing email + password + hidden `next` + submit button + form-level error region.
6. Verify the form action passes through correctly: `<input name="email">`, `<input name="password" type="password">`, `<input type="hidden" name="next" value={next}>`. Names MUST match `SignInSchema` keys (FormData → object via the schema).
7. i18n: confirm `messages/{vi,en}.json` has `auth.signIn.title`, `subtitle`, `emailLabel`, `passwordLabel`, `submit`, `submitting`, `invalidCredentials`, `rateLimited`, `unenrolledError`, `genericError`.
8. Visual smoke: `pnpm dev` → `/vi/sign-in` and `/en/sign-in` render; locale switcher (`Link` from `i18n/navigation`) optional in this phase.
9. `pnpm typecheck` + `pnpm lint` + `pnpm build`.

## Todo List
- [ ] shadcn primitives installed
- [ ] Sonner Toaster mounted globally
- [ ] `(auth)/layout.tsx` authored
- [ ] `(auth)/sign-in/page.tsx` authored — awaits async params + searchParams; redirects already-signed-in users
- [ ] `(auth)/sign-in/sign-in-form.tsx` authored — RHF + useActionState integration
- [ ] i18n keys verified (both locales)
- [ ] Visual smoke: form renders in both locales
- [ ] `pnpm build` green (catches `'use cache'` regressions, missing await)

## Success Criteria
- `/vi/sign-in` and `/en/sign-in` both render the form with localized strings.
- Invalid email → inline RHF error (no server round-trip).
- Empty password → inline RHF error.
- Valid form → submit → if creds invalid, generic error renders; if creds valid + enrolled, redirect to `/${locale}/dashboard`.
- 6th rapid attempt → rate-limit banner with seconds remaining.
- Already-signed-in user hitting `/sign-in` → redirected to `/${locale}/dashboard`.
- Submit button disabled while pending; label shows the `submitting` i18n string.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| RHF `handleSubmit` used by mistake → bypasses Server Action | med | high | Code review checklist; comment in form file: "form action is dispatchAction, NOT handleSubmit" |
| Form field name mismatch with Zod schema → silent validation pass with empty values | med | med | Zod schema keys + `<input name>` reviewed together; phase 07 E2E catches |
| `'use client'` accidentally added to page.tsx (breaks getServerSession redirect) | low | med | Convention: server components are the default; client components have explicit `'use client'` at top |
| `<Toaster />` mounted twice → duplicate toasts | low | low | Single mount in root locale layout |
| Submitting a logged-out form race with refreshing tab → action returns success then layout redirects | low | low | Acceptable; user sees the dashboard after redirect |
| Locale switcher omitted → users can't switch languages | med | low | Defer to phase 06 shell; phase 04 ships single-locale UX only |
| shadcn `Form` component (RHF-aware) couples to `Form.Field` API that differs from native — confusion | low | low | Use shadcn `Input`/`Label`/`Button` primitives + raw RHF; skip `Form.*` composition (YAGNI) |
| Server returns redirect, browser sees both old and new pages briefly | low | low | React 19's Transition smooths this; acceptable |

## Security Considerations
- Password field: `type="password"`, `autoComplete="current-password"`. Email: `type="email"`, `autoComplete="email"`.
- Form submitted over HTTPS in prod (Vercel default).
- No password ever stored in client state beyond RHF's internal buffer (cleared on unmount).
- Error rendering keeps wording generic (delegated to phase 03 actions); no "wrong password" vs "no such user".
- `next` param echoed back into the form via hidden input — server validates per phase 03 F-03-4 step 6. Client display is read-only; no XSS surface (React escapes).
- No client-side Supabase calls. All auth state derived from server-rendered `user` via `SessionProvider` (phase 02).

## Next Steps
- Phase 05 consumes `signOutAction` (sign-out button in header) and adds the admin-invite action + UI sketch.
- Phase 06 builds the `(app)/layout.tsx` and the dashboard placeholder that this form redirects into.
- Phase 07 E2E covers the form's happy path + invalid path + rate-limit path.
