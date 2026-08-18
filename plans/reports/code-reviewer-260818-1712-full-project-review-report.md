# BSK Full-Project Code Review

Date: 2026-08-18
Reviewer: code-reviewer (staff-level, production-readiness lens)
Scope: full codebase — `lib/`, `app/` server actions + route handlers, `supabase/migrations/`, JS/JSDoc tooling, tests.
Verification: `npm run lint` (clean), `npm run typecheck` (clean), `npm test` (97 passing).

Note the project's own disclaimer: educational, synthetic data only, "not yet runtime-verified" against a live Supabase project. Severities below are written as if this were headed for production with real data (the stated review posture), then tempered by that disclaimer where relevant.

---

## Overall Assessment

The codebase is unusually disciplined for its size: server-authoritative billing math, SECURITY DEFINER RPCs with schema-pinned `search_path`, advisory-locked counters, allowlist-gated first-admin bootstrap, generic auth errors, IP-keyed rate limiting, and a consistent "RLS is the gate, `getServerSession()` is defense-in-depth" pattern across Server Actions. Lint/typecheck/tests are green.

However there is **one critical database-level authorization bypass** (NULL-unsafe role guard in the two staff-mutation RPCs) that is directly exploitable on the shared Supabase auth pool, plus a **role-scoping inconsistency** between the medical-record UI (clinical-gated) and the PDF export route handlers (enrolled-only), which is an IDOR/PII exposure. Both are the kind of defect that passes CI and every happy-path test.

---

## Critical Issues

### C1. Auth bypass: `set_staff_role` / `remove_staff` role guard is NULL-unsafe — unenrolled users can escalate privileges

File: `supabase/migrations/20260725140000_bsk_review_fixes.sql:95` and `:129`

```sql
IF bsk.current_role() <> 'admin' THEN
  RAISE EXCEPTION 'not authorized to change staff roles';
END IF;
```

`bsk.current_role()` returns **NULL** for any authenticated principal with no `bsk.app_users` row (`SELECT role ... WHERE user_id = auth.uid()` → no row → NULL; confirmed in `20260525163300_bsk_init.sql:60`). In PostgreSQL `NULL <> 'admin'` evaluates to **NULL**, and `IF NULL THEN` does **not** execute its branch — so the `RAISE` is skipped and execution falls through to the mutation.

Every other RPC in the schema uses the null-safe form `IF v_role IS NULL OR v_role NOT IN (...)` (e.g. `20260725121000_bsk_billing.sql:78,118,152`, `20260725115000_bsk_checkups.sql:113`, `20260725160000_bsk_call_next.sql:20`). Only these two staff RPCs regressed to the bare `<> 'admin'` negative test.

Both functions are `GRANT EXECUTE ... TO authenticated` (`review_fixes.sql` tail), so they are callable directly via the Supabase REST endpoint (`POST /rest/v1/rpc/set_staff_role`) by **any** authenticated JWT — bypassing the app-layer `session?.role !== "admin"` checks in `admin/staff/actions.js`, which are only defense-in-depth.

**Failure scenario (concrete, exploitable on the shared pool per CLAUDE.md's shared-auth model):**
1. Attacker holds two accounts on the shared Supabase project: account A (a sibling app's user, authenticated but **not** enrolled in BSK → `current_role()` = NULL) and account B (enrolled in BSK as `nurse`).
2. From account A, attacker calls `rpc('set_staff_role', { p_user_id: <B's uid>, p_role: 'admin' })`.
3. The `<> 'admin'` guard is NULL → not-raised → skipped. `p_user_id <> auth.uid()` passes (A ≠ B). Target B exists and is enrolled, so the last-admin guard is irrelevant. `UPDATE bsk.app_users SET role='admin' WHERE user_id=B`.
4. Account B is now a BSK admin. Full escalation, no BSK enrollment required by the attacker.

`remove_staff` is exploitable the same way (an unenrolled principal can delete arbitrary non-last-admin staff rows — a denial-of-service / lockout vector).

**Fix:** mirror the null-safe pattern used everywhere else:
```sql
DECLARE v_role bsk.app_role := bsk.current_role();
...
IF v_role IS NULL OR v_role <> 'admin' THEN
  RAISE EXCEPTION 'not authorized ...';
END IF;
```
Add a regression test (SQL or an integration test) that calls the RPC as an unenrolled role and asserts it raises.

---

## High Priority

### H1. IDOR / medical-PII exposure: report & prescription PDF route handlers gate on "enrolled", not "clinical"

Files:
- `app/[locale]/(app)/checkups/[id]/report/route.js:35-36`
- `app/[locale]/(app)/checkups/[id]/prescription/pdf/route.js:28-29`
- (lower sensitivity) `app/[locale]/(app)/checkups/[id]/invoice/route.js:30-31`

All three use:
```js
const session = await getServerSession();
if (!session?.role) return new Response("Forbidden", { status: 403 });
```

That admits **any** enrolled role — including `cashier` and `patient` — whereas the equivalent UI (`checkups/layout.jsx`) is restricted to clinical roles `['admin','receptionist','doctor','nurse']`. Route handlers do not inherit layout gates (correctly noted in `reports/revenue/route.js`), so the PDF endpoints are the real boundary and they are broader than the screens that link to them.

The report PDF embeds `diagnosis`, `conclusion`, vitals, DOB and gender; the prescription PDF embeds diagnosis, medicines and patient address. `checkupId` is a sequential `GENERATED ALWAYS AS IDENTITY`, so it is trivially enumerable.

**Failure scenario:** a `cashier` (billing-only) or a `patient`-role account iterates `/vi/checkups/1..N/report` and harvests every patient's diagnosis and demographics — data the app's own navigation never exposes to that role.

**Fix:** gate the report and prescription PDF routes to the clinical set (reuse the same array as the layout); keep invoice at admin/cashier if that matches billing intent. Consider deriving all four from one shared `CLINICAL`/`BILLING` constant so the route and layout can't drift.

### H2. Storage RLS lets any enrolled role read every checkup media object

File: `supabase/migrations/20260725122000_bsk_imaging.sql:66-71` (`bsk_checkup_media_select`)

```sql
CREATE POLICY bsk_checkup_media_select ON storage.objects FOR SELECT
  USING (bucket_id = 'bsk-checkup-media' AND bsk.current_role() IS NOT NULL);
```

Same class of gap as H1 at the storage layer: the imaging *page* is clinical-gated and issues short-lived signed URLs, but the underlying object-read policy allows any enrolled principal (cashier/patient) with a browser Supabase client to list/download **all** ultrasound/clinical images in the bucket, cross-checkup. `checkup_images.storage_path` is `{checkupId}/{uuid}.jpg`; the UUID adds obscurity but the policy itself does not scope by role or by checkup.

**Fix:** narrow the storage SELECT/INSERT/UPDATE/DELETE policies to the clinical role set, matching `checkup_images_insert_clinical`. The read policy being broader than the table's own insert policy is the tell.

---

## Medium Priority

### M1. TOCTOU between paid-invoice lock and prescription/service writes

Files: `supabase/migrations/20260725140000_bsk_review_fixes.sql` (`save_prescription`/`save_checkup_services` paid check) vs `20260725121000_bsk_billing.sql:146` (`mark_order_paid`).

`save_prescription` does `IF EXISTS (... payment_status='paid') THEN RAISE` then `DELETE`/`INSERT`, with **no** advisory lock. `mark_order_paid` upserts `payment_status='paid'` also without a shared lock. Two concurrent transactions (cashier marks paid while a nurse re-saves lines) can interleave so a line-item rewrite commits after payment, diverging the recorded invoice from what was paid. The staff RPCs and the queue counter got advisory locks in the same review pass; the paid-lock did not.

**Fix:** take `pg_advisory_xact_lock(hashtext('bsk:invoice:'||p_checkup_id))` at the top of all three functions, or re-check `payment_status` inside a `SELECT ... FOR UPDATE` on the `medicine_orders` row.

### M2. `mark_order_paid` accepts empty/soft-deleted invoices

File: `20260725121000_bsk_billing.sql:146`

The function upserts `paid` without verifying the checkup exists-and-not-deleted or that any `order_items`/`checkup_services` lines exist. A checkup can be marked paid with a zero-line invoice, and a soft-deleted checkup can still be paid. Billing-integrity gap; low exploit value but it will surface as reconciliation noise in the revenue export.

**Fix:** guard on `EXISTS (SELECT 1 FROM bsk.checkups WHERE id=p_checkup_id AND NOT deleted)` and optionally require ≥1 line.

### M3. PDF/invoice/report queries fetch customer without `deleted` filter

Files: `invoice/route.js:44`, `report/route.js` customer fetch, `prescription/pdf/route.js` customer fetch.

Customer rows are fetched by `id` only; a soft-deleted patient still renders on documents. Minor data-hygiene issue, not a leak.

### M4. Rate-limit fail-open leaves brute-force / SMTP-spend unprotected during Redis outage

Files: `sign-in/actions.js` (login limiter), `admin/invite/actions.js` (invite limiter).

Both catch limiter errors and continue (fail-open), which is a defensible availability choice for a shared free-tier Redis and is documented. Flagging so it is a conscious, alertable decision: during an Upstash outage the 5/min login guard and 20/hr invite guard both vanish silently (only a `console.warn`). Consider a metric/alert rather than a log line, and consider fail-closed on the invite path (SMTP spend is harder to undo than a login retry).

---

## Low Priority

- **L1.** `search_customers` (`20260725112500_bsk_patients.sql:70`) interpolates the raw query into `LIKE '%'||q||'%'`. Parameterized, so no SQLi, but `%`/`_` in `q` act as wildcards and are not escaped — cosmetic search-quality quirk only.
- **L2.** Sign-in enumeration timing difference (extra `signOut` round-trip on the unenrolled path) is documented in `sign-in/actions.js`; acceptable for scope.
- **L3.** `callPatientAction` (`queue/actions.js`) updates `checkups.status` with no `deleted=false` guard; RLS still restricts to clinical roles, and re-calling a soft-deleted row is harmless, so this is informational.
- **L4.** `formatVndCompact`/`sumLineTotals` support both `line_total` and `lineTotal` shapes; the dual-key `||` fallback (`totals.js:17`) is a small footgun if a future caller passes `lineTotal: 0` alongside `line_total: undefined` — `0 || undefined` works, but `(undefined ?? undefined) || 0` masks genuinely-missing fields as 0. Not currently triggered.

---

## Test Coverage Gaps (critical paths)

The 97 unit tests cover schemas + `sumLineTotals` + date/age helpers well, but the highest-risk logic is untested:

1. **Server-authoritative billing recompute** (`save_prescription`/`save_checkup_services` snapshotting `sale_price`/`price` and computing `line_total`) has **no** test — it's SQL, and the unit suite can only reach the pure JS `sumLineTotals`. This is the single most security-relevant behavior ("client totals are a preview only") and nothing proves the RPC actually ignores client-supplied prices.
2. **Role guards in RPCs** — C1 would have been caught by one integration test asserting `set_staff_role` raises when called as an unenrolled/NULL role. No SQL-level auth tests exist.
3. **`isValidStoragePath`** (path-traversal / cross-checkup defense in `image-schema.js`) and **`isProtectedPath`** (proxy locale-strip regex) are pure and trivially testable but untested.
4. E2e happy path (queue→checkup→prescription→paid→invoice) requires a seeded Supabase project and is documented as not yet run — so the RLS/RPC layer has never executed end-to-end (matches the README caveat).

Recommend a lightweight pgTAP or Supabase integration harness for the RPC auth + billing-recompute paths; those are where the real invariants live and where CI currently proves nothing.

---

## Consistency of the JSDoc-typed JS setup

Solid and internally consistent:
- `jsconfig.json` runs `checkJs` + `strict` + `noUncheckedIndexedAccess` + `noImplicitOverride`; typecheck is clean.
- ESLint enforces `no-restricted-imports` on `@supabase/supabase-js`, `@upstash/redis`, `@upstash/ratelimit` so all call sites go through the schema/prefix-scoped factories — this is the right guardrail for the shared-project model and it holds across the tree.
- `lib/db/roles.js` derives `AppRole` from the tuple and has a compile-time `satisfies`-style guard against the generated DB enum; good drift protection.
- No tracked secrets or `*.tsbuildinfo`/`.env` (gitignored); `check-no-secret-leak.mjs` exists as a guard.

No inconsistencies found here worth blocking on.

---

## Positive Observations (risk-calibration)

- Billing totals are genuinely server-authoritative: the RPCs recompute `unit_price`/`line_total` from the catalogs and the read paths (`invoice`, `dashboard`, `revenue`) sum stored `line_total` rather than trusting client input. This closes the classic tampering vector — the C1 bug is an auth-boundary regression, not a billing-math one.
- First-admin bootstrap is allowlist-gated + advisory-locked + inserts `auth.uid()` (not a caller-supplied id) — the earlier shared-pool hole was correctly closed in `20260724233400`.
- `getServerSession()` uses `getUser()` (server-validated JWT), never `getSession()`; documented and correct.
- Redirects are consistently kept outside try/catch (Next.js throws NEXT_REDIRECT) — a common footgun that is handled correctly throughout.

---

## Recommended Actions (prioritized)

1. **C1** — fix the NULL-unsafe guard in `set_staff_role`/`remove_staff` (new migration; null-safe `v_role IS NULL OR v_role <> 'admin'`). Add an RPC-level auth regression test. **Blocking.**
2. **H1** — clinical-gate the report + prescription PDF route handlers (and confirm invoice's intended audience). **Blocking for real-data use.**
3. **H2** — narrow the `bsk-checkup-media` storage RLS policies to clinical roles.
4. **M1** — advisory-lock the invoice paid/write path (`save_prescription`, `save_checkup_services`, `mark_order_paid`).
5. **M2/M3** — validate checkup existence/not-deleted in `mark_order_paid`; add `deleted=false` to document customer fetches.
6. Add SQL/integration tests for RPC auth guards and server-side billing recompute (coverage gap #1, #2).

---

## Unresolved Questions

- Is the `patient` role ever actually provisioned via invite, or is it vestigial? If it can be assigned, H1/H2 are materially worse (a patient-role account reading all patients' records). If it's dead, say so and consider removing it from `appRoles` to shrink the trust surface.
- Is the shared-auth-pool threat model (sibling-app users authenticating against the same Supabase project) in scope for BSK's RBAC? C1's exploitability hinges on it; the invite/bootstrap code clearly assumes it is, so the staff RPCs should too.
