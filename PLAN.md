# BSK Rewrite — Implementation Plan

Educational rewrite of [lds217/BSK-All-in-One-Clinic-Management-System](https://github.com/lds217/BSK-All-in-One-Clinic-Management-System) (Java/Swing/Netty/SQLite clinic management) into a modern web stack.

**Status:** Planning. No code yet.
**Goals:** learn the stack end-to-end; produce a working web equivalent of the original's core workflows; do not migrate real data.

---

## 1. Target stack

| Layer | Choice |
|---|---|
| Package manager | pnpm |
| Framework | Next.js 15 (App Router, RSC, Server Actions) |
| Language | TypeScript (strict) |
| Hosting | Vercel (Hobby tier) |
| DB + Auth + Storage | Supabase (Postgres + Auth + Storage) |
| Cache / rate-limit / queue | Upstash Redis + QStash |
| UI | shadcn/ui + Tailwind CSS |
| Forms | react-hook-form + zod |
| Tables | TanStack Table |
| PDF | `@react-pdf/renderer` (replaces JasperReports) |
| i18n | `next-intl` (Vietnamese + English; default vi) |

## 2. Shared-infrastructure design

The user-stated requirement: one Supabase project and one Upstash database serve **multiple unrelated Vercel projects** (BSK is one of 3–10 side projects).

### 2.1 Supabase: schema-per-app

- One Supabase Postgres project, **one schema per app**: `bsk`, plus future `blog`, `links`, etc.
- All BSK tables live in schema `bsk`. **Never** put BSK tables in `public`.
- Each schema is added to Supabase **Settings → API → Exposed schemas**.
- Each app's Next.js client binds to its schema via `createClient(url, key, { db: { schema: 'bsk' } })`.
- TypeScript codegen scoped per schema: `supabase gen types typescript --schema bsk > types/supabase-bsk.ts`.

### 2.2 Supabase Auth: shared `auth.users` + per-app enrollment

- `auth.users` is shared across schemas (unavoidable — one auth schema per project). SSO across side projects is a feature, not a bug — for personal infra.
- **Authorization is per-app**: a `bsk.app_users(user_id, role, created_at)` table gates BSK access. Existing in `auth.users` grants nothing on its own.
- Roles: `admin` | `doctor` | `nurse` | `receptionist` | `cashier` | `patient` (patient self-portal optional, deferred).
- RLS helper: `bsk.current_role()` (`SECURITY DEFINER STABLE`) returns the caller's role from `bsk.app_users`. Every RLS policy reads from this helper.

### 2.3 Upstash: shared Redis with key prefixes

- One Upstash Redis DB, shared. BSK key prefix: `bsk:{env}:` (e.g., `bsk:prod:ratelimit:user:123`).
- `@upstash/ratelimit` configured with `prefix: 'bsk:prod:ratelimit'`.
- **QStash** for per-event delayed jobs (appointment reminders 24h before). Vercel Cron only for daily sweeps (reports, cleanup).
- Always-separate Redis DBs: prod vs preview/dev.

### 2.4 Repo layout

- **Polyrepo.** This repo is BSK-only. No monorepo until at least two apps share *domain* code.
- Shared infra client code (~50 lines of factories) starts as copy-paste; extracted into a private npm package only when it stops changing.

### 2.5 Migrations

- `supabase/migrations/*.sql` in this repo, every DDL statement **schema-qualified** (`CREATE TABLE bsk.patients ...`).
- Migration filenames prefixed with app name: `20260601000000_bsk_init.sql`. Minimizes filename collisions in the shared `supabase_migrations.schema_migrations` table.
- **Never** run `supabase db reset` against the shared project.

## 3. Open decision — call before Phase 0

> **The brainstorm strongly recommended splitting BSK onto its own Supabase project** because:
> - Free-tier blast radius: one bad BSK migration triggers a point-in-time restore of *every* schema in the shared project.
> - Schema-level access controls don't exist on free tier — all apps share the same anon/service-role keys; isolation is RLS-only.
> - Even synthetic medical data sets a precedent worth isolating.
>
> The user's stated requirement is shared infra. **Default:** follow the stated requirement (BSK lives in the shared project, schema `bsk`). **Revisit** if the project ever sees real patient data or if shared-project incidents start hurting other apps.

## 4. Feature scope (phased)

The original has 25+ features. Rewriting all at once is a trap. Phases below are sized so each ends with a demoable, deployable slice.

### Phase 0 — Foundation
- Repo scaffold: `pnpm create next-app`, TypeScript strict, Tailwind, shadcn/ui, ESLint, Prettier.
- Supabase project created (or schema `bsk` carved out of shared one).
- Upstash Redis DB + QStash topic provisioned.
- Vercel project linked; env vars set per environment.
- `lib/supabase/{server,client,admin}.ts` factories scoped to schema `bsk`.
- `lib/upstash.ts` with prefixed rate-limit + cache helpers.
- `next-intl` configured (vi default, en fallback).
- CI: typecheck + lint on PR.

### Phase 1 — Identity & access
- Migration `bsk_init`: `app_users`, role enum, `bsk.current_role()` helper, RLS enabled.
- Sign-in via Supabase Auth (email/password to start; magic link optional).
- Admin enrollment flow (first user → admin; subsequent users invited).
- Role-gated layout shell (sidebar shows only what role can access).
- Audit log table `bsk.audit_log` writing on every clinical mutation (skeleton).

### Phase 2 — Core entities (CRUD)
- `customers` (patients), `doctors`, `staff_users` (extends `app_users`), `clinic_settings`, `provinces`, `wards` (seed Vietnamese geo data).
- Admin pages for managing doctors, services, medicines, clinic info.
- Server Actions for mutations; RSC for reads; TanStack Table on list pages.

### Phase 3 — Queue & checkup workflow
- `shifts`, `daily_queue_counters`, `checkups` (status enum, queue number, vitals, diagnosis, conclusion, re-checkup date).
- Receptionist: register patient, assign to queue.
- Doctor: pick up next in queue, fill checkup form, mark complete.
- **Realtime queue** via Supabase Realtime (replaces original's packet broadcast).
- Status workflow with optimistic UI.

### Phase 4 — Prescriptions, services, billing
- `medicines`, `services`, `medicine_orders`, `order_items`, `checkup_services`.
- Prescription composer (search medicines, set dosage/quantity, autosum).
- Invoice generation (medicines + services + grand total).
- Cashier role: mark paid, record payment method.

### Phase 5 — Imaging
- Replace Google Drive with **Supabase Storage** (`bsk-checkup-media` bucket, RLS-protected).
- Browser-side capture using `getUserMedia` for webcam (no native USB ultrasound device support — out of educational scope).
- Per-checkup media gallery; QR/barcode generation client-side (`bwip-js`).
- Signed-URL access for staff with checkup permissions.

### Phase 6 — Printing & reports
- `@react-pdf/renderer` templates: invoice, prescription, ultrasound report.
- Excel export via `xlsx` (visit history, monthly revenue).
- Dashboard: today's queue size, completed checkups, revenue trend (recharts).

### Phase 7 — Reminders & background jobs
- QStash schedules: "24h-before-recheckup" reminder per checkup.
- Vercel Cron: nightly cleanup (expired sessions, old signed URLs).
- Optional: email channel via Resend; SMS deferred.

### Phase 8 — Polish
- Settings UI for clinic branding.
- Empty states, error boundaries, loading skeletons.
- Lighthouse + Core Web Vitals pass.
- README walkthrough + ATTRIBUTIONS verified.

## 5. Architecture choices that diverge from the original

| Original | Rewrite |
|---|---|
| Custom Netty packet protocol | Next.js Server Actions + Supabase Realtime |
| SQLite WAL on server | Postgres (Supabase) |
| Swing desktop client | Web (responsive, no native app) |
| Google Drive OAuth for files | Supabase Storage with RLS |
| JasperReports `.jrxml` | `@react-pdf/renderer` React components |
| Pipe-delimited string serialization | Typed Zod schemas end-to-end |
| 3252-line `ServerHandler` god class | Server Actions per feature module + thin `lib/services/*` |
| Role names as free strings | Postgres enum + RLS helper |
| Hardcoded VN timezone | `Asia/Ho_Chi_Minh` constant + `date-fns-tz` |
| LocalStorage session blob | Supabase Auth cookie-based session |
| Per-event broadcast packets | Supabase Realtime channels |

## 6. Non-goals

- Migrating data from the original SQLite file.
- USB-attached ultrasound device capture (browser can't reach those reliably).
- Native printer drivers (browser print + downloadable PDF only).
- HIPAA/GDPR compliance (synthetic data only — call this out in README).
- Multi-tenant clinics (single-clinic deployment; multi-tenant is a future exercise).
- Real-time chat (original has a minimal `SimpleChatDialog` — drop it).

## 7. Risks

- **Free-tier ceiling.** Supabase 500MB DB + 1GB storage; Upstash 10K commands/day. Imaging will exhaust storage fast — Phase 5 must include image compression and a delete policy.
- **Shared project blast radius.** Acknowledged in §3.
- **Vietnamese language correctness.** The team has the original strings as ground truth; need a native reviewer eventually.
- **Real-time scale.** Supabase Realtime fan-out is fine at clinic scale (<50 clients). Don't over-engineer.
- **No tests in original.** This rewrite should at minimum have integration tests on the queue + checkup flow (Playwright) and unit tests on PDF/invoice math.

## 8. Attribution

This is a derivative educational work. The original repo carries **no explicit license** at the time of writing. Mitigations:

1. **Clean-room rewrite:** do not copy code from the original. Reimplement features from the public README and visible behavior. Schema names + Vietnamese UI strings are fair to mirror as they're functional facts of the domain.
2. **README credit:** prominent link + author handle at the top.
3. **`NOTICE` file:** lists the original project, author, and the educational/non-commercial purpose.
4. **Open question to original author:** open a GitHub issue on the upstream repo asking the author to choose a license (MIT/Apache 2.0 recommended).

## 9. Next steps

1. Decide §3 (shared-project vs split). Default: shared.
2. Provision Supabase project + Upstash DB + Vercel project. (User action.)
3. Begin Phase 0 scaffolding.
