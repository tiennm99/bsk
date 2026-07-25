# Phase 01 — NOW Hardening + Doctor-UX Foundation

## Context
- Reviews: `plans/reports/{researcher-…feature-parity, code-review-…phase-0-1-foundation, doctor-usability-…clinician-ux}-report.md`
- Only Phase 0/1 built. Fix shell habits before Phase 3 clinical screens inherit them.

## Files
Create:
- `supabase/migrations/20260724233400_bsk_admin_allowlist.sql`
- `components/app-shell/sidebar-nav.tsx` (client — active-route nav)
- `docs/design-guidelines.md`

Modify:
- `types/supabase-bsk.ts` (claim_first_admin → no-arg)
- `app/[locale]/(auth)/sign-in/actions.ts` (rate limit + simplified claim call)
- `app/[locale]/(app)/admin/invite/actions.ts` (rate limit)
- `components/app-shell/locale-switcher.tsx` (focus ring)
- `components/app-shell/sidebar.tsx` (role label i18n, use SidebarNav)
- `app/[locale]/(app)/dashboard/page.tsx` (role label i18n)
- `app/[locale]/(app)/admin/invite/invite-user-form.tsx` (role option i18n, submit enable)
- `app/globals.css` (muted-foreground contrast)
- `messages/vi.json`, `messages/en.json` (roles dict, rate-limit + password-reveal strings)
- `app/[locale]/(auth)/sign-in/sign-in-form.tsx` (autofocus, password reveal, submit enable)

## Steps
1. Migration: `bsk.admin_allowlist` table (RLS on, no client grants); replace `claim_first_admin(uuid)` with allowlist-gated no-arg `claim_first_admin()` using `auth.uid()` + `auth.jwt()->>'email'`; revoke direct writes on `app_users` from `authenticated`.
2. Update generated types for the new signature.
3. Wire `createRateLimiter` into sign-in (5/60s by IP) and invite (20/3600s by admin id).
4. UX: focus ring; role i18n at 3 sites; client `SidebarNav` with `aria-current`; darken muted-foreground; sign-in autofocus + password reveal + always-enabled submit.
5. `docs/design-guidelines.md`.

## Validation
- `pnpm typecheck` / `tsc --noEmit`, `pnpm lint`, `pnpm build`.
- Manual: keyboard-tab locale switcher shows focus; VN role labels render; active nav highlighted.

## Risks / rollback
- Migration is additive + a REVOKE. Rollback: `GRANT INSERT,UPDATE,DELETE ON bsk.app_users TO authenticated;` + restore prior function from `20260525163400_bsk_admin.sql`. **Operator must seed `bsk.admin_allowlist` before first sign-in** or no one can bootstrap admin.
- Rate-limit env: `UPSTASH_*` already required by `lib/env/server.ts`, so limiter always has Redis.
