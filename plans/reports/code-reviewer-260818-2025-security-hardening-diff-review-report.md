# Security-Hardening Diff Review — 20260818202600 + route gating

Date: 2026-08-18. Reviewer: code-reviewer. Advisory only; nothing modified.
Scope: `supabase/migrations/20260818202600_bsk_security_hardening.sql`, route-gating diffs
(report/prescription/invoice route.js, `lib/db/roles.js`), `admin/invite/actions.js`,
interaction with `20260818171800_bsk_service_role_grants.sql`.
Baseline findings: `plans/reports/code-reviewer-260818-1712-full-project-review-report.md` (C1/H1/H2/M1–M4/L1).
SQL not executable locally — verification by line-level comparison against prior migration definitions.

## Fix-by-fix verdicts

| Finding | Fix | Verdict |
|---|---|---|
| C1 null-unsafe admin guard | `set_staff_role`/`remove_staff` rewrite | **VERIFIED** |
| M1 paid-invoice TOCTOU | per-checkup advisory lock in 3 RPCs | **VERIFIED** |
| M2 empty/deleted-checkup payment | guards in `mark_order_paid` | **VERIFIED** |
| H2 storage policy too broad | 4 policies DROP+CREATE, clinical set | **VERIFIED** (env caveat, see H-1 below) |
| L1 LIKE wildcards | `search_customers` escaping | **VERIFIED** |
| H1 PDF route IDOR | clinical/billing gates | **VERIFIED** |
| M3 deleted customer on documents | `.eq("deleted", false)` on customer fetch | **VERIFIED** (renders "—", does NOT 404 — assessment below) |
| M4 invite limiter fail-open | fail-closed | **VERIFIED** |

No DEFECTIVE items. Details and residual issues below.

### (a) C1 — set_staff_role / remove_staff (migration :25-92)

Line-by-line against `20260725140000_bsk_review_fixes.sql:85-150`: the ONLY change is the
added `v_role bsk.app_role := bsk.current_role()` declaration and the null-safe
`IF v_role IS NULL OR v_role <> 'admin'` guard. Preserved identically: self-change guards
(`p_user_id = auth.uid()` raise), `pg_advisory_xact_lock(hashtext('bsk:staff')::bigint)`
placement (after guards, before target lookup — same as before), `RAISE 'user not enrolled'`
in set_staff_role vs `RETURN -- already gone` in remove_staff, both last-admin invariants
(`count(*) <= 1` with the `p_role <> 'admin'` demotion condition only in set_staff_role).
Signature/returns/volatility/SECURITY DEFINER/search_path unchanged, so `CREATE OR REPLACE`
retains the existing `GRANT EXECUTE ... TO authenticated` from 20260725140000 — no re-grant
needed, none attempted. Correct.

### (b) M1 — advisory lock in save_prescription / save_checkup_services / mark_order_paid

Both saves are byte-identical to their 20260725140000 definitions except the single added
`PERFORM pg_advisory_xact_lock(hashtext('bsk:invoice:' || p_checkup_id::text)::bigint)`
(migration :111, :150, :184). Key derivation is the identical expression in all three;
`hashtext` only needs intra-database determinism for advisory locks, which it has.
`p_checkup_id` is `bigint` in all three so `::text` renders identically. Lock is taken
before the paid-status check in the saves and before the guards in `mark_order_paid`, so
the check-then-act is serialized — the TOCTOU is closed. Single lock per transaction, no
lock-ordering/deadlock exposure against the `'bsk:staff'` lock.

Lock coverage is complete for user paths: `20260725121000_bsk_billing.sql:191-197` grants
only SELECT on `order_items`/`checkup_services`/`medicine_orders` to `authenticated` and
defines no write policies — writes can only enter via these three RPCs.

NULL `p_checkup_id` edge: `hashtext(NULL)` is NULL and strict `pg_advisory_xact_lock(NULL)`
no-ops, but every downstream path then raises (NOT NULL/PK violation in the saves,
exists-guard in `mark_order_paid`) — no silent unlocked mutation.

### (c) M2 — mark_order_paid guards (migration :186-195)

Identical to `20260725121000:142-164` except lock + `NOT EXISTS (... checkups WHERE id=...
AND NOT deleted)` raise + zero-line raise (checks both `order_items` AND `checkup_services`
with the correct AND-of-NOT-EXISTS logic: raises only when *both* are empty). Upsert clause
unchanged (payment_status/payment_method/processed_by/paid_at via EXCLUDED).

### (d) H2 — storage policies (migration :210-231)

All four policy names (`bsk_checkup_media_{select,insert,update,delete}`) match
`20260725122000_bsk_imaging.sql:64-87` exactly; DROP IF EXISTS covers all four, all four
recreated — nothing left dangling. Each retains the `bucket_id = 'bsk-checkup-media'`
scope; UPDATE has both USING and WITH CHECK. Role set is exactly the clinical four,
matching `checkup_images_insert_clinical`.

Enum-vs-text: `bsk.current_role() IN ('admin','receptionist','doctor','nurse')` — the
unknown-typed literals are coerced to `bsk.app_role`; all four are valid enum labels
(init migration :20-27). Unenrolled caller: `NULL IN (...)` → NULL → policy denies. This is
the same construct the existing table policies already use. Valid.

Alignment check: the report route signs URLs with the user-JWT client
(`report/route.js:90-92`), which now requires the clinical SELECT policy — and the route
itself is now clinical-gated, so signing still works for every role that can reach it.

### (e) L1 — search_customers escaping (migration :234-258)

Escape order correct: backslash doubled FIRST (:246-247, :248-249), then `%` → `\%`, then
`_` → `\_` — reversing that order would corrupt the escapes; this doesn't. Under
`standard_conforming_strings = on` (default since PG 9.1; Supabase does not override),
`'\'` is one backslash and `'\\'` is two, which is what the replaces need. LIKE's default
escape character is backslash, so no `ESCAPE` clause is required — correct as written.
Escaping is applied to `immutable_unaccent(lower(q))` output on the name branch (unaccent
never emits `%`/`_`/`\`, so escaping after unaccent is sound) and to raw `q` on the phone
branch. Unchanged vs `20260725112500:61-78`: signature `(q text)`, `RETURNS SETOF
bsk.customers`, `LANGUAGE sql STABLE`, `SET search_path = bsk, pg_catalog`, no SECURITY
clause (stays SECURITY INVOKER — RLS still applies), `NOT deleted` filter, empty-q branch,
ORDER BY, LIMIT 50. The multi-line COMMENT uses adjacent string-literal concatenation
(valid SQL, same style as the original file).

### Route gating (H1) + roles.js

- `report/route.js:39` and `prescription/pdf/route.js:32`: `!session?.role ||
  !clinicalRoles.includes(session.role)` → 403. `clinicalRoles` =
  `["admin","receptionist","doctor","nurse"]`, matching `checkups/layout.jsx:11` exactly.
- `invoice/route.js:30`: `billingRoles` = all five staff roles, excluding `patient`. This is
  broader than the baseline report's "admin/cashier" suggestion but is a documented,
  deliberate choice (roles.js comment + route comment); invoices carry names/prices, not
  diagnosis. Acceptable.
- `.includes(session.role)` soundness: `session.role` is `AppRole | null`
  (get-server-session.js:17), null is short-circuited by `!session?.role` first; the arrays
  are `readonly AppRole[]` so the typed `includes` param matches; runtime is plain string
  comparison. Sound. `cashier`/`patient` cannot reach report/prescription; `patient` cannot
  reach invoice.

### M3 — deleted=false on customer fetch: does NOT 404

All three routes use `.maybeSingle()` and render `customer ? ... : "—"`
(report/route.js:115, prescription/pdf/route.js:101, invoice/route.js:101). A soft-deleted
patient's historical checkup PDF still renders — checkup content, diagnosis, lines, and
totals intact — with the patient block anonymized to "—". **No legitimate flow breaks**;
the hypothesized 404 regression does not exist. Assessment: acceptable as shipped. Residual
nit: a reprinted historical prescription with no patient name is a degraded document, and
the anonymization is silent. If reprint-fidelity matters, prefer fetching without the
filter and rendering a "(deleted patient)" marker. Non-blocking; product call.

### M4 — invite limiter fail-closed (actions.js:53-61)

Catch path now returns `{ status: "error", fieldErrors: {}, formError: t("tooManyRequests") }`
— identical shape to every other error return in the action (`InviteUserState` contract
kept). `admin.invite.tooManyRequests` exists in both `messages/en.json:25` and
`messages/vi.json:25`. `inviteLimiter` is constructed and consumed only in this file; the
sign-in limiter (`sign-in/actions.js:29`) is a separate `createRateLimiter("login",...)`
instance and remains fail-open, per the documented split. No other caller depends on
fail-open. Nit: during a Redis outage the admin sees "Too many invites sent" — slightly
misleading for an infrastructure failure, but safe.

### Migration-ordering / conflict check (20260818171800 vs 20260818202600)

Timestamps order correctly (171800 < 202600). Object sets are disjoint: 171800 touches
table grants + default privileges for `service_role`; 202600 touches functions and storage
policies. `ALTER DEFAULT PRIVILEGES ... ON TABLES` does not affect functions/policies. No
conflict. One deliberate interaction worth stating: `service_role` (full DML per 171800,
RLS-bypassing by design) writes `order_items`/`checkup_services`/`medicine_orders` directly
in `scripts/migrate-from-upstream.mjs:612,648,681` and is NOT covered by the invoice
advisory lock or the paid-invoice guard. Acceptable for offline operator scripts; do not
run the upstream import against a live clinic mid-shift.

## Residual issues (new, not blocking)

- **L-1** `lib/db/roles.js:31-33` comment claims clinicalRoles is "Shared by layouts AND
  route handlers so the PDF endpoints can never drift" — false as written: all four layouts
  (`checkups`, `queue`, `patients`, `reminders` layout.jsx:11/:17) still hard-code inline
  `["admin","receptionist","doctor","nurse"]` arrays and do not import `clinicalRoles`.
  Values currently match, but the drift-proofing the comment promises does not exist.
  Either wire the layouts to the constant or soften the comment.
- **L-2** `save_prescription`/`save_checkup_services` still accept a soft-deleted checkup
  (no `NOT deleted` guard; nonexistent checkup fails on FK). `mark_order_paid` now blocks
  paying it, so the financial exposure is closed; lines written to a deleted checkup are
  orphan noise only. Informational — consistent with baseline L3.
- **H-1 (environment caveat, not a code defect)** `DROP POLICY`/`CREATE POLICY` on
  `storage.objects` requires table-owner-level privilege. The original imaging migration
  already makes the same assumption (it CREATEs these policies), so this adds no new risk
  class, but some hosted Supabase projects reject storage.objects DDL from the `postgres`
  migration role ("must be owner of table objects"). Unverifiable locally; if `supabase db
  push` fails here, the fallback is the dashboard storage-policy editor. Watch this
  statement specifically at deploy time — if the DROPs succeed and a CREATE fails, the
  bucket is left with NO select policy (fail-closed, safe direction, but imaging breaks).
- **Info** hashtext collisions (between invoice keys, or with `'bsk:staff'`) only
  over-serialize; no correctness risk. Migration is re-runnable (DROP IF EXISTS + CREATE
  OR REPLACE throughout).

## Unresolved questions

1. `billingRoles` = all staff for the invoice PDF is broader than the baseline report's
   admin/cashier suggestion — deliberate and documented, but confirm it matches billing
   intent (does a doctor/nurse need to print invoices?).
2. Anonymized ("—") patient block on historical PDFs for soft-deleted patients: acceptable,
   or should it render a "(deleted)" marker / 404? Product call (see M3 assessment).
3. H-1 deploy-time caveat: has `supabase db push` with storage.objects policy DDL been
   exercised against this specific hosted project before? The imaging migration would have
   proven it if it was ever pushed.
