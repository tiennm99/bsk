---
title: "BSK Phase 1 — Identity & Access"
description: "DB schema, Supabase Auth wiring, sign-in form, admin enrollment, role-gated shell, first E2E."
status: pending
priority: P1
effort: ~14h
branch: main
tags: [phase-1, auth, rls, supabase, next-intl, playwright]
created: 2026-05-25
---

# Phase 1 — Identity & Access

## Status
Planning. No code yet. Depends on user provisioning (see Key Dependencies).

## Goals (user-visible "done")
1. An invited user lands on `/[locale]/sign-in`, submits email+password, and is redirected to `/[locale]/dashboard`.
2. The dashboard shell shows a sidebar whose items are filtered by the user's `bsk.app_role` (admin sees everything; nurse sees nurse-relevant items; etc.).
3. The first signed-in user becomes admin atomically (no race window for two concurrent first-signups to both become admin).
4. An admin can invite a new user with a chosen role via a Server Action (UI scaffolded; sending email may be deferred to Phase 1.5).
5. All BSK tables created in this phase have RLS enabled and policies.

## Sub-phases (status checklist)
- [ ] 01 — DB schema init (`bsk_init` migration: enum, `app_users`, `bsk.current_role()`, RLS + first policies)
- [ ] 02 — Auth session wiring (`proxy.ts` composes next-intl + Supabase session refresh; `[locale]/layout.tsx` reads session; cached-helpers receive user as arg)
- [ ] 03 — Auth Server Actions (Zod v4 schemas; `signInAction`, `signOutAction`; redirect/error contracts)
- [ ] 04 — Sign-in page (RHF + `useActionState` + shadcn primitives; i18n strings; route group `(auth)`)
- [ ] 05 — Admin enrollment (atomic first-user-becomes-admin; admin-only `inviteUserAction`)
- [ ] 06 — Role-gated shell (sidebar, route protection helper, `(app)` route group, `/dashboard` placeholder)

## Key dependencies (BLOCKERS — user-action prerequisites)
Before phase 01 SQL can land, the user MUST:
1. Provision the Supabase project (or confirm the shared one) and record its `project ref` in `docs/supabase-shared-config.md` (replace `_(fill in)_` placeholders).
2. Add the project ref to `ALLOWED_PROJECT_REFS` at `scripts/preflight-supabase.ts:23` (currently empty; `pnpm db:push` will refuse until populated).
3. Populate `.env.local` (and Vercel env vars for `dev`/`preview`/`prod`) from `.env.example` — Supabase URL + `sb_publishable_*` + `sb_secret_*`, Upstash URL+token.
4. Decide magic-link inclusion (see Open Questions).
5. Run `supabase link --project-ref <ref>` in repo root so `supabase/.temp/project-ref` exists for the preflight script.

Scaffold pieces consumed (no rework needed):
- `lib/supabase/{server,client,admin,session}.ts` factories (Phase 0).
- `lib/env/{client,server}.ts` env validation.
- `lib/upstash.ts` for the sign-in rate limiter.
- `i18n/{routing,navigation,request}.ts` for locale + `redirect` helper.
- `proxy.ts` (currently next-intl only; phase 02 extends).
- `app/[locale]/layout.tsx` (currently i18n-only; phase 02 extends).

## Phase-1-level risks
- **Cookie collision in `proxy.ts`.** next-intl and Supabase both want to own the `NextResponse`. Two competing responses → flicker / lost cookies / wrong locale redirect. Mitigation: phase 02 imposes a single composed handler; spec covered in `lib/supabase/session.ts:11-14` JSDoc.
- **`'use cache'` regression.** A cached helper that calls `createSupabaseServerClient()` builds-but-runtime-fails. Mitigation: every cached helper in this phase receives `user` / `role` as arguments; review check.
- **First-user-admin race.** Two simultaneous first signups could both flag as admin without serialization. Mitigation: phase 05 picks one of two race-safe strategies (advisory lock vs partial-unique index) — flag for user review before implementation.
- **Shared `auth.users` enumeration.** Threat-model R-doc'd. Sign-in failures must return generic "invalid credentials" regardless of whether the email exists in `auth.users` (already Supabase default, but verify and document).
- **Magic link deferral risk.** If the user later enables magic link, the sign-in page UX shifts. Mitigation: keep Zod schema strict to `{ email, password }`; magic-link is a separate action+route, not a flag on this one.

## Definition of done
- Phase 01–06 all checked.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` all green.
- `pnpm db:push` applied successfully against the linked project.
- `docs/supabase-shared-config.md` `_(fill in)_` placeholders resolved.

## Open questions
_(All resolved: D1 defer, D2 advisory lock, D3 audit cut, D4 [locale]/(auth)/sign-in, D5 defer, D6 moot, D7 cut.)_
