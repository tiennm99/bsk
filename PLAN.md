# BSK Rewrite — Implementation Plan

Educational rewrite of [lds217/BSK-All-in-One-Clinic-Management-System](https://github.com/lds217/BSK-All-in-One-Clinic-Management-System) (Java/Swing/Netty/SQLite clinic management) into a modern web stack.

**Status:** Planning. No code yet.
**Goals:** learn the stack end-to-end; produce a working web equivalent of the original's core workflows; do not migrate real data.

---

## 1. Target stack

Versions are pinned to the latest stable as of May 2026. No code is written yet, so we adopt current majors directly rather than upgrade-from-older.

| Layer | Choice |
|---|---|
| Package manager | pnpm |
| Framework | **Next.js 16** (App Router, RSC, Server Actions, `'use cache'` directive, Turbopack default) |
| Runtime | React 19 — `params` and `searchParams` are **async-only** (must `await`) |
| Language | TypeScript 5.9 (`"strict": true`); revisit TS 6 once `eslint-config-next` + `typescript-eslint` ship support |
| Hosting | Vercel (Hobby tier, Fluid Compute pricing) |
| DB + Auth + Storage | Supabase (Postgres + Auth + Storage); new `sb_publishable_*` / `sb_secret_*` key format (old keys retire 2026-12-31) |
| SSR client | `@supabase/ssr` (async `cookies()` aware) |
| Cache / rate-limit / queue | Upstash Redis + `@upstash/ratelimit` v2 + QStash |
| UI | **shadcn/ui** (CLI v4, Sonner over deprecated Toast) + **Tailwind CSS v4** (`@tailwindcss/postcss`, CSS-first `@theme`) |
| Forms / Validation | react-hook-form + **Zod v4**; `useActionState` (React 19) for Server Actions |
| Tables | TanStack Table v8 (RSC-friendly fetch patterns) |
| PDF | `@react-pdf/renderer` v4 (server-rendered from Server Actions / Route Handlers; replaces JasperReports) |
| Timezone | `date-fns-tz` (document Temporal API migration path; revisit when Safari ships Temporal) |
| i18n | `next-intl` v4 (Vietnamese default, English fallback) |
| Testing | Vitest (unit + Server Action / Zod schemas) + Playwright (E2E flows) |

## 2. Shared-infrastructure design

The user-stated requirement: one Supabase project and one Upstash database serve **multiple unrelated Vercel projects** (BSK is one of 3–10 side projects).

### 2.1 Supabase: schema-per-app

- One Supabase Postgres project, **one schema per app**: `bsk`, plus future `blog`, `links`, etc.
- All BSK tables live in schema `bsk`. **Never** put BSK tables in `public`.
- Each schema is added to Supabase **Settings → API → Exposed schemas**.
- Each app's Next.js client binds to its schema via `createClient(url, key, { db: { schema: 'bsk' } })`. The schema option sets PostgREST's `Accept-Profile`/`Content-Profile` headers so all reads and writes are scoped without per-query qualification.
- TypeScript codegen scoped per schema: `supabase gen types typescript --schema bsk > types/supabase-bsk.ts`. Each consuming app generates only its own schema's types.
- **API keys are project-wide, not schema-scoped.** The new `sb_publishable_*` (browser) and `sb_secret_*` (server) keys grant access to every exposed schema in the shared project. Isolation between apps is **purely RLS** — every BSK table must have RLS enabled and policies that gate on `bsk.current_role()`. There is no fallback if RLS is forgotten on a table.
- **Connection pool is shared** across all apps in the project. Long-running queries or runaway Server Actions in one app degrade every other app's latency. Keep Server Actions short; prefer Edge runtime where possible.

### 2.2 Supabase Auth: shared `auth.users` + per-app enrollment

- `auth.users` is shared across schemas (unavoidable — one auth schema per project). SSO across side projects is a feature, not a bug — for personal infra.
- **Authorization is per-app**: a `bsk.app_users(user_id, role, created_at)` table gates BSK access. Existing in `auth.users` grants nothing on its own.
- Roles: `admin` | `doctor` | `nurse` | `receptionist` | `cashier` | `patient` (patient self-portal optional, deferred).
- RLS helper: `bsk.current_role()` (`SECURITY DEFINER STABLE`) returns the caller's role from `bsk.app_users`. Every RLS policy reads from this helper.
- **Email templates, password rules, SMTP, OAuth providers, and JWT settings are project-wide** — changing them affects every app sharing the project. Coordinate before tweaking; document the current configuration in `docs/supabase-shared-config.md` so future apps don't get blindsided.

### 2.3 Supabase Realtime + Storage: namespacing across apps

- **Realtime channels are project-wide.** Channel names from different apps live in the same namespace; collisions cause cross-talk. Always prefix channel names with the app slug: `bsk:queue:{shift_id}`, never `queue:{shift_id}`.
- **Realtime authorization runs through RLS.** Postgres Changes subscriptions enforce the subscribing user's RLS on each row, so BSK tables only fan out to BSK-enrolled users. Confirmed safe for shared infra.
- **Storage buckets are project-wide.** Bucket names must be prefixed: `bsk-checkup-media`, `bsk-public-assets`. Each bucket has its own RLS policies; never make a BSK bucket public.

### 2.4 Upstash Redis + QStash: shared with key prefixes

- One Upstash Redis DB, shared. BSK key prefix: `bsk:{env}:` (e.g., `bsk:prod:ratelimit:user:123`).
- `@upstash/ratelimit` configured with `prefix: 'bsk:{env}:ratelimit'`. Cache helper in `lib/upstash.ts` enforces `bsk:{env}:cache:` for all `set`/`get` calls.
- **Never** issue `KEYS *`, `FLUSHDB`, or `FLUSHALL` from BSK code — they affect every app's keys. Use `SCAN` with the BSK prefix if a sweep is needed.
- **QStash** for per-event delayed jobs (appointment reminders 24h before). One QStash instance is shared across apps; isolation is via:
  - Distinct **destination URLs** per app (each app owns its own `/api/qstash/*` route handlers, and QStash signs the request with the shared signing key — the receiving app verifies the signature).
  - Distinct **topic/queue names** prefixed `bsk-` if topics are used (e.g., `bsk-recheckup-reminders`).
- **Vercel Cron is per-Vercel-project** (no sharing concern); each app schedules its own crons inside its own `vercel.json`.
- Always-separate Redis DBs: prod vs preview/dev (same prefix convention, different DBs). Preview deployments use the dev DB to avoid polluting prod keys.

### 2.5 Repo layout

- **Polyrepo.** This repo is BSK-only. No monorepo until at least two apps share *domain* code.
- Shared infra client code (~50 lines of factories — schema-scoped Supabase client, prefixed Upstash client, QStash signature verifier) starts as copy-paste; extracted into a private npm package (`@miti/shared-infra`?) only when it stops changing across apps.

### 2.6 Migrations

- `supabase/migrations/*.sql` in this repo, every DDL statement **schema-qualified** (`CREATE TABLE bsk.patients ...`). No bare `CREATE TABLE patients` — that would land in `public` and pollute the shared namespace.
- Migration filenames prefixed with app name: `20260601000000_bsk_init.sql`. Minimizes filename collisions in the shared `supabase_migrations.schema_migrations` table.
- Apply migrations via `supabase db push` from this repo's directory. **Never** run `supabase db reset` against the shared project — it wipes every app's data.
- Each app keeps its own migrations in its own repo; the shared project's migration log is the union of all apps' migrations, ordered by timestamp. Coordinate timestamps loosely (don't backdate) to keep the log readable.

### 2.7 Operational rules for shared infra (cheat-sheet)

Do:
- Schema-qualify every table, view, function, type, and policy.
- Prefix every Redis key, QStash topic, Realtime channel, and Storage bucket with `bsk-` or `bsk:`.
- Enable RLS on every BSK table at creation time; write the policy in the same migration.
- Keep `lib/supabase/` and `lib/upstash/` factories as the *only* places that read env vars — no ad-hoc `createClient` calls scattered across the codebase.

Don't:
- Put BSK tables, functions, or types in `public`.
- Use `KEYS *`, `FLUSHDB`, `FLUSHALL`, or unprefixed key writes against the shared Redis.
- Change project-wide Supabase settings (auth providers, email templates, JWT secrets) without checking with the other apps.
- Subscribe to an unprefixed Realtime channel name.
- Run `supabase db reset` or `supabase db remote commit` from this repo.

## 3. Open decision — call before Phase 0

> **The brainstorm strongly recommended splitting BSK onto its own Supabase project** because:
> - Free-tier blast radius: one bad BSK migration triggers a point-in-time restore of *every* schema in the shared project.
> - Schema-level access controls don't exist on free tier — all apps share the same anon/service-role keys; isolation is RLS-only.
> - Even synthetic medical data sets a precedent worth isolating.
>
> The user's stated requirement is shared infra. **Default:** follow the stated requirement (BSK lives in the shared project, schema `bsk`). **Revisit** if the project ever sees real patient data or if shared-project incidents start hurting other apps.

### 3.1 Next.js 16 / 2026 stack notes (read before Phase 0)

These are the cross-cutting changes the plan assumes everywhere; they're called out once here so phase descriptions stay short.

- **Async `params` / `searchParams`.** In Next.js 16 these are Promises in `page.tsx`, `layout.tsx`, route handlers, and metadata functions. Always `const { id } = await params;`. Lint rule + codemod (`npx @next/codemod@latest next-async-request-api .`) catches stragglers.
- **`'use cache'` replaces implicit caching.** Implicit App Router caching was removed. Cached scopes are explicit and **cannot** call `cookies()`, `headers()`, or read `searchParams` directly. Pattern: read runtime APIs at the page/layout level, then pass session/role into cached helpers as arguments.
- **Supabase client + `'use cache'` interaction.** Server clients depend on cookies; they must be created *outside* a cached scope. The cached helpers receive a pre-built client (or the data the client returned), not the cookie store.
- **Supabase Realtime + `'use cache'`.** Realtime channels are subscribed in Client Components or Route Handlers — never inside `'use cache'`. Cached reads provide the initial snapshot; Realtime drives deltas.
- **Turbopack is the default** for `next dev` and `next build`. No custom webpack config unless we have a concrete reason.
- **`middleware.ts` renamed to `proxy.ts`.** Next.js 16 deprecates the `middleware` file convention; the root file must be `proxy.ts` (build emits a warning on the old name). The export shape is unchanged — `next-intl`, `@supabase/ssr`, and other libraries still call it "middleware" internally; only the Next.js file convention moved.
- **`next lint` removed.** Use `eslint .` directly via `package.json` scripts.
- **Supabase API keys.** Use the new `sb_publishable_*` (browser) and `sb_secret_*` (server) keys from day one. Legacy `supabase_key_*` keys retire 2026-12-31.
- **Tailwind v4 install shape.** PostCSS config uses `@tailwindcss/postcss`; theme lives in `globals.css` via `@theme`, not in a JS config file. `shadcn init` already scaffolds this layout.
- **Forms.** React 19's `useActionState` is the official Server-Action form integration. No `next-safe-action` / `zsa` wrapper needed; pair with `react-hook-form` for client-side UX and Zod v4 for the schema shared between client and server.

## 4. Feature scope (phased)

The original has 25+ features. Rewriting all at once is a trap. Phases below are sized so each ends with a demoable, deployable slice.

### Phase 0 — Foundation
- Repo scaffold: `pnpm create next-app@latest` (Next.js 16, App Router, TypeScript strict, Turbopack); add Tailwind v4 via `@tailwindcss/postcss` + CSS-first `@theme`; initialize shadcn/ui with `pnpm dlx shadcn@latest init` (CLI v4); ESLint + Prettier.
- Document the async-`await params` + `'use cache'` rules from §3.1 in `CONTRIBUTING.md` / inline comments on the first route, so future phases inherit the pattern.
- Supabase project created (or schema `bsk` carved out of shared one); use the new `sb_publishable_*` / `sb_secret_*` keys.
- Upstash Redis DB + QStash topic provisioned.
- Vercel project linked; env vars set per environment (`prod`, `preview`, `dev` keyspaces all distinct).
- `lib/supabase/{server,client,admin}.ts` factories scoped to schema `bsk`, built on `@supabase/ssr` with async `cookies()`. Server factory is created **per request, outside any `'use cache'` scope**.
- `lib/upstash.ts` with prefixed rate-limit + cache helpers (`@upstash/ratelimit` v2 with `prefix: 'bsk:{env}:ratelimit'`).
- `next-intl` v4 configured (vi default, en fallback) with App Router + async-params-aware setup.
- CI: typecheck (`tsc --noEmit`), lint, `next build` on PR. (Build is fast enough on Turbopack to stay in CI.)

### Phase 1 — Identity & access
- Migration `bsk_init`: `app_users`, role enum, `bsk.current_role()` helper (`SECURITY DEFINER STABLE`), RLS enabled.
- Sign-in via Supabase Auth (email/password to start; magic link optional). Sign-in form uses react-hook-form + Zod v4 + `useActionState` to call a Server Action.
- Cookie/session reads happen in the root `layout.tsx` (outside `'use cache'`); cached role/permission helpers receive the user object as an argument.
- Admin enrollment flow (first user → admin; subsequent users invited).
- Role-gated layout shell (sidebar shows only what role can access).
- Audit log table `bsk.audit_log` writing on every clinical mutation (skeleton).
- First Playwright E2E: sign-in → land on dashboard with correct role-gated sidebar.

### Phase 2 — Core entities (CRUD)
- `customers` (patients), `doctors`, `staff_users` (extends `app_users`), `clinic_settings`, `provinces`, `wards` (seed Vietnamese geo data).
- Admin pages for managing doctors, services, medicines, clinic info.
- Server Actions for mutations; RSC for reads; TanStack Table on list pages.

### Phase 3 — Queue & checkup workflow
- `shifts`, `daily_queue_counters`, `checkups` (status enum, queue number, vitals, diagnosis, conclusion, re-checkup date).
- Receptionist: register patient, assign to queue.
- Doctor: pick up next in queue, fill checkup form, mark complete.
- **Realtime queue** via Supabase Realtime (replaces original's packet broadcast). Subscribed in a Client Component; initial snapshot comes from a cached RSC fetch, deltas come from the channel.
- Status workflow with optimistic UI (`useOptimistic` + Server Action).
- Playwright E2E for receptionist→doctor queue handoff; Vitest unit tests for queue-number assignment logic.

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
- **Cost controls (mandatory for Hobby tier — 1 GB total Supabase Storage, shared across sibling apps):**
  - Client-side image compression target: **≤200 KB/image** (browser canvas + JPEG quality knob).
  - Signed-URL TTL: **1 h** (regenerate per session; never embed a long-lived URL).
  - Retention window: **7 days** from upload. Nightly Vercel Cron sweeps `bsk-checkup-media` and deletes older objects.
  - Budget math (rough): 200 KB × 5 photos × 20 checkups/day × 7 days ≈ 140 MB resident — leaves headroom for sibling apps.
- Document an optional Cloudinary/Imgix migration path for production clinics; out of scope for the educational build.

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

- **Free-tier ceiling.** Supabase 500 MB DB + 1 GB storage; Upstash 10K commands/day. Imaging (Phase 5) is the dominant consumer — compression, short signed-URL TTLs, and the nightly retention sweep are non-negotiable, not nice-to-haves.
- **Vercel Hobby compute.** Fluid Compute gives 4 hours Active CPU/month + 1M function invocations/month. Plenty for clinic-scale traffic (<100 checkups/day), but the QStash reminder cardinality must stay bounded — one job per recheckup, not per minute. Monitor `vercel.com/usage`; the upgrade lever is Pro at $20/seat/mo.
- **Shared project blast radius.** Acknowledged in §3.
- **Vietnamese language correctness.** The team has the original strings as ground truth; need a native reviewer eventually.
- **Real-time scale.** Supabase Realtime fan-out is fine at clinic scale (<50 clients). Don't over-engineer.
- **`'use cache'` regressions.** Easy to accidentally cache a function that reads `cookies()` and have it fail at build/runtime. CI must run `next build` (Turbopack) on every PR so cache violations surface before merge.
- **Async params drift.** Any forgotten `await params` is a runtime error in Next 16. Lint with `@next/eslint-plugin-next` and consider running the codemod periodically on third-party snippet imports.
- **No tests in original.** This rewrite should at minimum have integration tests on the queue + checkup flow (Playwright) and unit tests on PDF/invoice math.

## 8. Attribution

This is a derivative educational work. The original repo carries **no explicit license** at the time of writing. Mitigations:

1. **Clean-room rewrite:** do not copy code from the original. Reimplement features from the public README and visible behavior. Schema names + Vietnamese UI strings are fair to mirror as they're functional facts of the domain.
2. **README credit:** prominent link + author handle at the top.
3. **`NOTICE` file:** lists the original project, author, and the educational/non-commercial purpose.
4. **Open question to original author:** open a GitHub issue on the upstream repo asking the author to choose a license (MIT/Apache 2.0 recommended).

## 9. Next steps

1. Decide §3 (shared-project vs split). Default: shared.
2. Provision Supabase project + Upstash DB + Vercel project. Generate the new `sb_publishable_*` / `sb_secret_*` keys at this point. (User action.)
3. Begin Phase 0 scaffolding on Next.js 16 + Tailwind v4 + shadcn/ui CLI v4 per §1 and §3.1.
