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
2. **Seed Vietnamese geo data** (province/ward address dropdowns): `npm run db:seed-geo` (see `scripts/seed-geo.mjs`).
3. **Enable Supabase Realtime** on `bsk.checkups` (Database → Replication) for the live queue.
4. **Set `CRON_SECRET`** in Vercel so the nightly media-retention sweep (`/api/cron/nightly`, scheduled in `vercel.json`) can authenticate.

See [docs/supabase-shared-config.md](./docs/supabase-shared-config.md) for the shared-project rules and [docs/design-guidelines.md](./docs/design-guidelines.md) for UI conventions.

### Migrating data from the original BSK app

An existing install of the upstream Java app can be imported from its SQLite file (`database/BSK.db`):

```bash
npm run db:migrate-upstream -- /path/to/BSK.db --dry-run   # preview counts + warnings, no writes
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
  npm run db:migrate-upstream -- /path/to/BSK.db
```

**Copying the file:** the upstream server runs SQLite in WAL mode — stop the Java server first and copy `BSK.db` together with its `BSK.db-wal`/`BSK.db-shm` siblings (or checkpoint first), otherwise the newest visits are silently missing.

Run it once, after `npm run db:push`, against an otherwise empty `bsk` schema (it re-keys all ids and refuses a non-empty target). Migrated: clinic settings, doctors, medicines, services, checkup templates (upstream RTF content converted to plain-text field labels — review them in the admin UI afterwards), patients (including pre-1970 birth dates), visits (shift 0/1 → morning/afternoon; suggestion, per-service notes, and the ultrasound doctor are folded into the visit notes), prescriptions, service lines, payment state, queue counters. **Not** migrated: staff accounts (re-invite via staff management — upstream passwords are never reused), patient images (Google Drive stays where it is), medicine descriptions/preferred notes (warned when present), and patient province/ward codes (the names remain readable at the end of each address string; backfill codes in the UI after `npm run db:seed-geo`). The script header and the reports `researcher-260818-1712-…-migration-mapping` and `code-reviewer-260818-1749-…-upstream-compat-audit` under `plans/reports/` document the full field mapping and its source-level verification.

## Stack

- **npm** + **Next.js 16** (App Router) + **JavaScript with JSDoc types** (checked by tsc)
- **Supabase** (Postgres + Auth + Storage) — shared across personal projects via schema-per-app
- **Upstash** Redis + QStash — shared across personal projects via key prefixes
- **Vercel** for hosting
- **shadcn/ui** + Tailwind CSS

## Important disclaimers

- **Educational use only.** This codebase is not certified for clinical use and must never be deployed against real patient data. Use synthetic data only.
- **No HIPAA / GDPR compliance** is implied or attempted on the free-tier infrastructure.
- This is a derivative work for learning; if you are the upstream author and would like additional attribution or removal, please open an issue.

## Database

After `npm run db:push`, run `npm run db:gen-types` to refresh `types/supabase-bsk.d.ts`.

## License

This repository is licensed under the [Apache License 2.0](./LICENSE). The original project does not currently carry an explicit license; see [NOTICE](./NOTICE) for the attribution stance.
