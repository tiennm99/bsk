# Phase 06 — Role-Gated Layout Shell

## Context Links
- `PLAN.md` §4 Phase 1 (role-gated layout shell; sidebar shows only what role can access)
- Scout citations:
  - phase 02 outputs: `getServerSession()`, `<SessionProvider>`, `useSession()`
  - phase 01 outputs: `bsk.current_role()`, `lib/db/roles.ts`'s `appRoles` + `AppRole` union
  - phase 03 outputs: `signOutAction`
  - `i18n/navigation.ts:4` — locale-aware `Link`
- shadcn primitives: install `dropdown-menu`, `avatar`, `separator`, `sheet` (mobile sidebar)

## Overview
- **Priority:** P1
- **Status:** pending
- **Brief:** The authenticated app shell. `(app)` route group with a layout that requires `getServerSession()` to return a non-null user AND role; otherwise redirects. Sidebar items mapped per role. Dashboard placeholder page. Sign-out button. Locale switcher. Admin-only routes (`/admin/**`) double-gated by a nested layout.

## Key Insights
- Layout-level gating runs on every request to a `(app)` route. Cheap because `getServerSession()` re-reads cookies + makes one RPC call to `bsk.current_role()` — already done in proxy, so the layout reuses the same auth state.
- Sidebar mapping table lives in `lib/auth/role-menu.ts` — a single source of truth `{ [role]: MenuItem[] }`. Server-rendered (RSC), so no JS-side gating dance.
- `useSession()` from `<SessionProvider>` is client-side. Used only for the avatar / display name / sign-out button. Authorization decisions stay on the server.
- The proxy (phase 02) does a coarse "no user → redirect" for protected prefixes. The `(app)` layout does the FINE-grained "user but no enrollment / no role → sign-out + redirect" — defends against an authed-but-unenrolled user reaching protected pages somehow.
- Admin-only nested layout: `app/[locale]/(app)/admin/layout.tsx` calls `getServerSession()` and `if (role !== 'admin') redirect('/${locale}/dashboard')`. Two-level enforcement is intentional: (a) sidebar omits admin items for non-admins (cosmetic), (b) layout-level redirect (security).
- Dashboard placeholder: `/[locale]/(app)/dashboard/page.tsx` is a minimal "Welcome, {name}. Role: {role}" page. Real dashboard content lands in later phases.
- Locale switcher uses `useRouter` from `i18n/navigation`. Preserves the current path when switching `vi ↔ en`.

## Requirements

### Functional
- F-06-1: `app/[locale]/(app)/layout.tsx` — server component:
  - Awaits `params` (Locale).
  - Calls `getServerSession()`. If `user === null` → `redirect('/${locale}/sign-in')` (defense in depth, even though proxy already redirected). If `role === null` (user authed but not enrolled — should be impossible past phase 03 + 05, but possible if admin deleted their `app_users` row mid-session) → trigger `signOutAction` redirect + flash an error.
  - Renders the shell: `<AppShell user={user} role={role}>{children}</AppShell>`.
- F-06-2: `components/app-shell/app-shell.tsx` — server component. Composes `<Sidebar>` + `<TopBar>` + `<main>`. Receives `user`, `role` as props.
- F-06-3: `components/app-shell/sidebar.tsx` — server component. Reads `role` prop, looks up `ROLE_MENU[role]`, renders `<Link>` items using `i18n/navigation`. Empty for unknown role (impossible because layout pre-validates).
- F-06-4: `components/app-shell/top-bar.tsx` — `'use client'`. Right-side: locale switcher + avatar dropdown (display name + sign-out button — sign-out is a form with `action={signOutAction}`).
- F-06-5: `lib/auth/role-menu.ts` — `MenuItem` type + `ROLE_MENU: Record<AppRole, MenuItem[]>` table. Items: `{ href: string, labelKey: string, icon: ComponentType }`. Use `lucide-react` icons.
- F-06-6: Role-menu rough mapping (refined per phase as features land):
  - `admin`: Dashboard, Patients, Doctors, Services, Medicines, Reports, Admin → Invite Users, Admin → Settings.
  - `doctor`: Dashboard, Queue, Checkups, Patients (read-only).
  - `nurse`: Dashboard, Queue, Checkups (assist).
  - `receptionist`: Dashboard, Queue, Register Patient.
  - `cashier`: Dashboard, Invoices, Payments.
  - `patient`: Dashboard (self-portal placeholder).
- F-06-7: `app/[locale]/(app)/dashboard/page.tsx` — placeholder. Awaits `params`. Renders "Welcome, {name} ({role})". Uses i18n.
- F-06-8: `app/[locale]/(app)/admin/layout.tsx` — admin-gate layout. `getServerSession()` → if `role !== 'admin'` → `redirect('/${locale}/dashboard')` (could 404 instead; redirect feels nicer + avoids leaking that admin routes exist).
- F-06-9: Sign-out button form: `<form action={signOutAction}><button>Sign out</button></form>`. Triggers `signOutAction` from phase 03.
- F-06-10: Locale switcher: client-side, uses `useRouter()` + `usePathname()` from `i18n/navigation` to replace current locale.

### Non-functional
- N-06-1: Sidebar file ≤ 80 LOC. TopBar ≤ 100 LOC. AppShell ≤ 60 LOC.
- N-06-2: No client-side Supabase calls. All session info comes from server-rendered props or `useSession()` context.
- N-06-3: Mobile responsive: shadcn `Sheet` for the mobile drawer. Desktop fixed sidebar.
- N-06-4: Sidebar items use `Link` from `i18n/navigation` (locale-aware).

## Architecture

### Layout tree
```
app/
└─ [locale]/
   ├─ layout.tsx                       (phase 02: session provider, i18n)
   ├─ (auth)/                          (phase 04: public)
   │  ├─ layout.tsx
   │  └─ sign-in/...
   └─ (app)/                           (phase 06: auth required)
      ├─ layout.tsx                    (gate: user + role)
      ├─ dashboard/page.tsx            (placeholder)
      └─ admin/                        (admin-only)
         ├─ layout.tsx                 (gate: role === 'admin')
         ├─ invite/...                 (phase 05)
         └─ settings/...               (future)
```

### Auth gate flow
```
Request → proxy.ts (phase 02)
  │ if !user & protected-prefix → redirect /sign-in
  ▼
[locale]/layout.tsx
  │ get user from createSupabaseServerClient
  │ wrap in SessionProvider
  ▼
(app)/layout.tsx
  │ getServerSession() → { user, role }
  │ if !user → redirect /sign-in
  │ if !role → signOut + redirect /sign-in with error
  ▼
AppShell renders
  ├─ Sidebar (server, role-aware)
  ├─ TopBar (client, useSession + locale switcher + signOut button)
  └─ {children}
       ▼
       (admin)/layout.tsx (only on admin routes)
         │ if role !== 'admin' → redirect /dashboard
         ▼
         admin pages
```

### Role-menu table (pseudocode, source of truth)
```
ROLE_MENU: {
  admin:        [Dashboard, Patients, Doctors, Services, Medicines, Reports, Admin:Invite, Admin:Settings],
  doctor:       [Dashboard, Queue, Checkups, Patients],
  nurse:        [Dashboard, Queue, Checkups],
  receptionist: [Dashboard, Queue, Register],
  cashier:      [Dashboard, Invoices, Payments],
  patient:      [Dashboard]
}
```
Items reference `labelKey` like `'nav.dashboard'`, `'nav.queue'`, etc. — all in i18n catalogs.

## Related Code Files

### Files to create
- `app/[locale]/(app)/layout.tsx` (~40 LOC)
- `app/[locale]/(app)/dashboard/page.tsx` (~30 LOC)
- `app/[locale]/(app)/admin/layout.tsx` (~25 LOC)
- `components/app-shell/app-shell.tsx` (~50 LOC, server)
- `components/app-shell/sidebar.tsx` (~70 LOC, server)
- `components/app-shell/top-bar.tsx` (~90 LOC, client)
- `components/app-shell/locale-switcher.tsx` (~40 LOC, client)
- `components/app-shell/sign-out-button.tsx` (~25 LOC, client wraps `<form action>` so the button can show pending state)
- `lib/auth/role-menu.ts` (~80 LOC) — `MenuItem` + `ROLE_MENU` table.
- `lib/auth/require-role.ts` (~20 LOC) — server helper `requireRole(allowed: AppRole[])` calls `getServerSession()`, redirects if no match. Used by admin layout + future per-route gates.

### Files to modify
- `messages/{vi,en}.json` — add `nav.*` keys (dashboard, queue, patients, doctors, services, medicines, reports, register, invoices, payments, admin) + `app.signOut`, `app.localeSwitcher.*`, `app.unenrolledError`.
- `components/ui/{dropdown-menu,avatar,separator,sheet}.tsx` — shadcn CLI installs.

### Files to delete
- None.

## Implementation Steps
1. Install shadcn primitives: `pnpm dlx shadcn@latest add dropdown-menu avatar separator sheet`.
2. Author `lib/auth/role-menu.ts`. Hand-curate the mapping per F-06-6. Use `lucide-react` icons sparingly.
3. Author `lib/auth/require-role.ts`. Server-only helper. Re-exports for layout gates.
4. Author `components/app-shell/sidebar.tsx`. Server component. Renders the role's menu items. Active-link highlighting via `usePathname` is client-side — defer; sidebar stays server-rendered for this phase.
5. Author `components/app-shell/locale-switcher.tsx`. Client. Uses `useRouter().replace(pathname, { locale: nextLocale })`.
6. Author `components/app-shell/sign-out-button.tsx`. Client. `<form action={signOutAction}>` + `useFormStatus()` to show pending state on the button.
7. Author `components/app-shell/top-bar.tsx`. Client. Renders the locale switcher + avatar dropdown (display name from `useSession()`) + sign-out button.
8. Author `components/app-shell/app-shell.tsx`. Server. Composes sidebar + top bar + `<main className="flex-1">`.
9. Author `app/[locale]/(app)/layout.tsx`. Server. `getServerSession()` → gate → render `<AppShell>`.
10. Author `app/[locale]/(app)/dashboard/page.tsx`. Placeholder welcome.
11. Author `app/[locale]/(app)/admin/layout.tsx`. Server. Calls `requireRole(['admin'])`.
12. i18n: add nav keys + app shell strings in `messages/{vi,en}.json`.
13. Update phase 02's `PROTECTED_PATH_PREFIXES` if needed (`/dashboard`, `/admin` already covered).
14. `pnpm typecheck` + `pnpm lint` + `pnpm build`.
15. Manual smoke:
    - Unauth → `/vi/dashboard` → redirect to `/vi/sign-in?next=/vi/dashboard`.
    - Admin sign-in → land on `/vi/dashboard`; sidebar shows admin items including "Admin → Invite Users".
    - Receptionist sign-in (after admin invites one) → sidebar shows Dashboard, Queue, Register Patient ONLY.
    - Receptionist navigates to `/vi/admin/invite` directly → redirected to `/vi/dashboard`.

## Todo List
- [ ] shadcn primitives installed
- [ ] `lib/auth/role-menu.ts` authored — `ROLE_MENU` table
- [ ] `lib/auth/require-role.ts` authored
- [ ] `components/app-shell/{app-shell,sidebar,top-bar,locale-switcher,sign-out-button}.tsx` authored
- [ ] `(app)/layout.tsx` enforces user + role
- [ ] `(app)/dashboard/page.tsx` renders placeholder
- [ ] `(app)/admin/layout.tsx` enforces admin
- [ ] i18n `nav.*` + `app.*` keys added
- [ ] `pnpm build` green
- [ ] Manual smoke: every role's sidebar verified

## Success Criteria
- An admin sees all admin sidebar items including `/admin/invite`.
- A non-admin (e.g., receptionist) sees only their role's items; the admin item is not present.
- A non-admin hitting `/admin/invite` URL directly → redirect to `/dashboard`.
- A signed-out user hitting `/dashboard` → redirect to `/sign-in?next=...`.
- Sign-out button clears the session; redirect to `/sign-in`.
- Locale switcher swaps `vi ↔ en` while preserving the current pathname.
- `pnpm build` green (catches `'use cache'` regressions, missing `await` on params, unawaited promises).

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `getServerSession()` inadvertently cached → stale role | low | high | Helper has no `'use cache'`; documented; reviewed |
| Sidebar leaks admin items to non-admins (server-rendered with wrong role) | low | med | Role passed as prop from layout; layout fetches role server-side; no client mutation of role |
| Admin nested layout missed for a future admin route | med | med | Convention: every page under `/admin/**` is in `(app)/admin/`, which is inside the `requireRole(['admin'])` layout. PR checklist. |
| `redirect()` inside a try/catch swallows the redirect | med | high | `redirect()` only called outside try/catch in `getServerSession`/`requireRole` |
| Locale switcher doesn't preserve query params | low | low | Use `useRouter().replace(pathname, { locale })` — next-intl handles |
| Sign-out form double-submits | low | low | `useFormStatus()` disables button while pending |
| Mobile sidebar overlays content on desktop | low | low | shadcn `Sheet` is responsive; lg+ uses fixed aside |
| Adding a new role later requires touching `ROLE_MENU` AND DB enum AND types | high (when it happens) | low | One file per concern; documented as "add a role" runbook later |
| `requireRole` differs in behavior from layout-only gate → drift | low | med | Single helper called from both layout and admin actions; F-05 caller-role recheck uses it |

## Security Considerations
- Authorization happens on the server, twice: (a) layout-level redirect, (b) RLS at DB. Client-side hiding (sidebar) is UX only.
- `useSession()` exposes `user.email` and `user.id` to the client bundle. Both are already known to the client via Supabase Auth cookies. No additional leakage.
- The dashboard placeholder shows `user.email + role`. Role is server-confirmed; no client-tampering possible.
- Admin routes are protected by the nested `(app)/admin/layout.tsx`. A direct URL fetch by a non-admin returns the dashboard via redirect — does NOT leak the existence of admin pages (the URL is still navigable; we redirect rather than 404 because a deliberate 404 leaks "this route exists with restrictions" the same way).
- Sign-out clears Supabase cookies via the SDK. Local state from `useSession()` becomes stale; phase 02's proxy redirects subsequent requests, and the SessionProvider re-renders on next layout pass.

## Next Steps
- Phase 07 E2E exercises this layout end-to-end.
- Phase 2 features (Customers, Doctors, Services CRUD) plug into the sidebar's existing slots — `lib/auth/role-menu.ts` is the only file that needs editing to surface new pages.
- A future "deactivate user" admin flow flips a `bsk.app_users.is_active` flag (not in this phase's schema; phase 2 adds it). Layout gate would then also reject inactive users.
