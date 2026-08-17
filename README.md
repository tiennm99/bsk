# BSK (Rewrite)

An educational rewrite of the **BSK All-in-One Clinic Management System** into a modern web stack.

> **Original project:** [lds217/BSK-All-in-One-Clinic-Management-System](https://github.com/lds217/BSK-All-in-One-Clinic-Management-System) by **[@lds217](https://github.com/lds217)** — a Java/Swing desktop application with a Netty server and SQLite backend, built for small Vietnamese clinics.
>
> This repository is a **clean-room reimplementation for learning purposes**. No source code is copied from the original; features and data shapes are reimplemented from the upstream README and observable behavior. See [NOTICE](./NOTICE) for full attribution.

## Status

Feature-complete against the original (Phases 0–8). See [PLAN.md](./PLAN.md) for the architecture and phased roadmap.

**Built:** auth + RBAC (allowlist-gated admin bootstrap, rate limiting, audit log); master data (doctors, medicines, services, checkup templates, clinic settings, staff management); patients (VN geo lookup + accent-insensitive search, detail page with visit history, recently-seen); queue + checkup workflow with realtime, per-shift queue-counter control, and template-driven checkup fields; prescriptions + billing (server-authoritative VND totals, paid-invoice lock, cashier mark-paid); imaging (webcam/file capture, downscale + ≤200 KB compression, signed URLs, barcode); reports (Vietnamese PDF invoice / prescription / ultrasound report, Excel exports for visits, patients, catalog and revenue, revenue dashboard); recheck reminders + nightly retention sweep.

Every command in the original's server protocol is either implemented or recorded as a non-goal in [PLAN.md](./PLAN.md) §6 — see the audits under `plans/reports/` for the source-grounded mapping.

**Testing:** `npm test` runs the Vitest unit suite (schemas, invoice math, date/age helpers). `npm run test:e2e` runs Playwright smoke tests that need no database (auth gates, i18n, sign-in ergonomics); the full queue→checkup→prescription→paid→invoice happy path needs a seeded Supabase project — prerequisites are documented in [tests/e2e/README.md](./tests/e2e/README.md).

> **Not yet runtime-verified.** The code type-checks, lints, builds, and passes the suites above, but the infrastructure-dependent paths (Realtime queue push, Storage upload/webcam, PDF/Excel rendering against real rows, the SQL RPCs, and the cron sweep) have never been executed against a live Supabase project. Smoke-test them after the setup below.

### First-run setup (operator)

After provisioning Supabase/Upstash/Vercel and `npm run db:push`:

1. **Seed the admin allowlist** before the first sign-in (or nobody can bootstrap admin):
   ```sql
   INSERT INTO bsk.admin_allowlist (email) VALUES ('you@example.com');
   ```
2. **Seed Vietnamese geo data** (province/ward address dropdowns): `npm run db:seed-geo` (see `scripts/seed-geo.ts`).
3. **Enable Supabase Realtime** on `bsk.checkups` (Database → Replication) for the live queue.
4. **Set `CRON_SECRET`** in Vercel so the nightly media-retention sweep (`/api/cron/nightly`, scheduled in `vercel.json`) can authenticate.

See [docs/supabase-shared-config.md](./docs/supabase-shared-config.md) for the shared-project rules and [docs/design-guidelines.md](./docs/design-guidelines.md) for UI conventions.

## Stack

- **npm** + **Next.js 16** (App Router) + **TypeScript**
- **Supabase** (Postgres + Auth + Storage) — shared across personal projects via schema-per-app
- **Upstash** Redis + QStash — shared across personal projects via key prefixes
- **Vercel** for hosting
- **shadcn/ui** + Tailwind CSS

## Important disclaimers

- **Educational use only.** This codebase is not certified for clinical use and must never be deployed against real patient data. Use synthetic data only.
- **No HIPAA / GDPR compliance** is implied or attempted on the free-tier infrastructure.
- This is a derivative work for learning; if you are the upstream author and would like additional attribution or removal, please open an issue.

## Database

After `npm run db:push`, run `npm run db:gen-types` to refresh `types/supabase-bsk.ts`.

## License

This repository is licensed under the [Apache License 2.0](./LICENSE). The original project does not currently carry an explicit license; see [NOTICE](./NOTICE) for the attribution stance.
