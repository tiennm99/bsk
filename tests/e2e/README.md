# E2E Test Constraints

This directory contains infrastructure-level smoke tests for the BSK clinic app. These tests are designed to run **without a live Supabase instance** by only asserting on public, unauthenticated routes.

## What's Tested

- **Auth gate** (`auth-gate.spec.ts`): Unauthenticated access to `/dashboard`, `/queue`, `/patients` redirects to sign-in.
- **Sign-in page** (`sign-in-page.spec.ts`): Form rendering, input focus, password reveal toggle, basic interactivity.
- **i18n & 404** (`i18n-and-404.spec.ts`): English/Vietnamese locale rendering, not-found page localization.

## What's NOT Tested (Blocked)

The complete happy-path user journey is **blocked on a provisioned Supabase project** with the following seed data:

1. **Patient registration → queue number**
   - Requires: clinic settings (clinic name), shifts, patients table, queue logic
   - Spec outline: `register-patient.spec.ts` (not yet written)

2. **Call patient → open checkup form**
   - Requires: doctor assignments, checkup status workflows
   - Spec outline: `call-patient.spec.ts` (not yet written)

3. **Save checkup → compose prescription**
   - Requires: templates, medicines catalog, services catalog
   - Spec outline: `save-checkup-and-prescribe.spec.ts` (not yet written)

4. **Mark paid → generate invoice PDF**
   - Requires: payment status workflow, PDF rendering
   - Spec outline: `invoice-workflow.spec.ts` (not yet written)

## To Enable Full E2E Testing

Provision a Supabase project with:

- All migrations from `supabase/migrations/` applied
- Seed data:
  - At least one clinic (in clinic_settings)
  - One admin user + one doctor + one cashier (in auth.users + custom claims)
  - 5–10 test patients (in customers table)
  - 3 shifts (in shifts table)
  - 5–10 medicines (in medicines table)
  - 3–5 services (in services table)

Then:

1. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `playwright.config.ts` (under `webServer.env`).
2. Set `SUPABASE_SECRET_KEY` and `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or mock them).
3. Write the full journey specs in this directory.

## Running Tests

```bash
# All E2E tests (smoke suite only until Supabase is provisioned)
pnpm test:e2e

# Watch mode
pnpm test:e2e --watch

# With UI
pnpm test:e2e --ui

# Specific file
pnpm test:e2e auth-gate.spec.ts
```

## Debugging

```bash
# Show browser
HEADED=1 pnpm test:e2e

# Slow motion (100ms per step)
pnpm test:e2e --headed --workers=1 --trace=on
```
