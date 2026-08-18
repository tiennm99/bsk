# Pending Migration Changes — Pre-commit Review

**Date:** 2026-08-18
**Scope:** scripts/migrate-from-upstream.mjs (823 LOC), scripts/upstream-transforms.mjs (237 LOC), tests/unit/upstream-transforms.test.js, supabase/migrations/20260818171800_bsk_service_role_grants.sql, README.md, package.json
**Baseline:** every Critical/High/Medium item from the 260818-1749 upstream-compat audit re-verified against the new code.

---

## 1. Audit fixes — verification status (all implemented)

| Audit item | Verdict | Evidence |
|---|---|---|
| C1 shift 0/1 → 1/2 (checkups AND counters) | **Correct** | `SHIFT_MAP {0:1, 1:2}` + `mapShift` warn-once (upstream-transforms.mjs:161-179); used at migrate-from-upstream.mjs:524 and :689. `sourceOverview` prints `DISTINCT shift/status` (:747-750) — the recommended runtime probe is in |
| C2 RTF → text templates | **Correct** (parser caveats below, §3) | `rtfToText` (transforms:190-236) applied before line-split at migrate:379-383; post-run review warning at :387-390 |
| C3 pre-1970 DOBs kept, 1900–2100 window, no ×1000 heuristic | **Correct** | transforms:74-97 — negative millis accepted, seconds heuristic removed, `ms===0`→null, out-of-window warn+null. Tests pin -631152000000→1950-01-01 and 50000000000→1971-08-03 (correct: VN was UTC+8 pre-1975) |
| H1 per-service notes folded into checkup notes | **Correct** | `collectServiceNoteLines` (:430-450) → `Dịch vụ X: …` lines merged at :511-516 |
| H2 medicine preferred_note/description/supplement warn | **Implemented (aggregate)** | :319-327 — one count-level warning, not per-medicine; operator can't tell WHICH medicines carry metadata (see L7) |
| H3 ultrasound doctor folded | **Correct** | `BS siêu âm: <name>` via `doctors.nameOf` (:507-514); Vietnamese "last first" order |
| H4 legacy OrderItem via MedicineOrder prescription_id join | **Correct** | `prescToCheckup` map (:573-579), fallback at :584-585; `sourceOverview` counts NULL-checkup_id rows (:751-758) |
| M1 remind_date → recheck_date fallback | **Correct** | `vnDate(r.recheckupdate) ?? vnDate(r.remind_date)` (:547); lowercase keys match `readTable`'s lowercasing |
| M2 geo migration dropped | **Correct** | no `migrateGeo`; NOTE at :263-266; README directs to `db:seed-geo` |
| M3 address-string comment fixed | **Correct** | header :47-49 now states ward/province NAMES are in the address suffix |
| M4 zero vitals nulled | **Correct** | heart_beat `"0"`→null, blood_pressure `"0/0"`→null (:519-541); weight/height via `vital()` `n<=0`→null |
| M5 WAL warning | **Correct** | header :17-20, runtime `-wal` sibling check (:726-734), README paragraph |
| M6 preflight extended | **Correct** | 8 insert-target tables checked (:770-779); upsert-keyed tables (clinic_settings, medicine_orders, daily_queue_counters) reasonably exempt |
| int(null)→null | **Correct** | transforms:53-57; pinned by test |
| PAID_LABELS documented as belt-and-braces | **Correct** | transforms:154-156 |

Mechanics re-checked and sound: dry-run negative-placeholder ids stay truthy through every `!id` guard; PostgREST chunked insert + `.select("id")` in-order with length assertion (:187-204); `medicine_orders` deduped in a Map before upsert; explicit `created_at`/`updated_at` legal (trigger is BEFORE UPDATE only); all enum/CHECK outputs legal (`waiting|in_progress|done`, `unpaid|paid`, template gender ∈ any/male/female/other, `photo_num>=0`, quantity>0 guards on both line tables, NOT NULL names defaulted to `""`); env var names match seed-geo.mjs/lib/supabase/admin.js; vitest `@` alias resolves (vitest.config `resolve.alias`).

---

## 2. High priority

### H-A. Unvalidated legacy dd/MM/yyyy DOB strings can abort the run mid-migration
`vnDate` (upstream-transforms.mjs:102-105) converts any `^(\d{1,2})[/-](\d{1,2})[/-](\d{4})` prefix without range-checking day/month. Legacy TEXT DOBs exist upstream (the audit confirmed the dd/MM/yyyy read path), and old hand-entered data can contain `31/02/1985` or `00/01/1990` → the script emits `"1985-02-31"` / `"1990-01-00"` → Postgres `date` parse error → the whole customers insert chunk fails → `die()` at migrate-from-upstream.mjs:197 with clinic/doctors/medicines/services/templates already written and no rollback. Recovery requires manually wiping `bsk` data.
**Fix:** range-check (month 1-12, day 1-31) or round-trip through `Date.UTC` and compare; warn + return null on failure — consistent with every other bad-value path in the script.

## 3. Medium priority

### M-A. `order_items.line_total` trusts raw `total_price` presence, not parseability
migrate-from-upstream.mjs:603 — `r.total_price != null ? money(r.total_price) : quantity * unitPrice`. Upstream stores OrderItem values as TEXT (`setString`). An empty string or non-numeric value passes the `!= null` gate, `money("")`/`money("abc")` → **0**, so the row is stored with `line_total = 0` while `quantity * unit_price > 0` — silently wrong billing history (passes the `>= 0` CHECK). Gate on parseability instead: fall back to `quantity * unitPrice` when `Number(r.total_price)` is not finite or `str(r.total_price)` is null.

### M-B. `daily_queue_counters` upsert dies on duplicate (day, shift) source rows
migrate-from-upstream.mjs:694-696 — payload is pushed row-by-row and upserted in one statement. If the upstream `DailyQueueCounter` table lacks a unique index on (date, shift) and ever accumulated duplicates (its schema/PK was unverifiable from the shallow clone), Postgres raises "ON CONFLICT DO UPDATE command cannot affect row a second time" → `die()`. `migrateMedicineOrders` already dedupes via a Map for exactly this reason; do the same here keyed on `${day}|${shiftId}` (last wins).

### M-C. RTF parser: escaped braces inside skipped destination groups corrupt depth tracking
upstream-transforms.mjs:194-206 — the `{`/`}` checks run **before** the `skipDepth > 0` skip, and backslashes inside a skipped group are consumed one char at a time. So `\{` inside e.g. a fonttbl (a font name containing a literal brace) is seen as bare `{` → `skipDepth++` with no matching decrement → the parser stays in skip mode and **silently swallows the entire rest of the template text**. Low probability with RTFEditorKit output (font names are `Dialog`, `Monospaced`…), but the failure is total-content loss for that template with only the generic "review templates" warning. Fix: while `skipDepth > 0`, consume `\X` two chars at a time before the brace checks.

## 4. Low priority

- **L1** `money()` silently maps garbage/negatives to 0 (audit Low, still open) — masks discount/typo rows; test at tests/unit/upstream-transforms.test.js:95 pins the silent behavior as intended, so this is now a documented decision.
- **L2** `\'hh` decoded via `String.fromCharCode` = Latin-1, not the declared cp1252 (transforms:208-212): bytes 0x80–0x9F (smart quotes, dashes) become control chars in field labels. Cosmetic.
- **L3** `\tab` (and other dropped control words) emit nothing — adjacent words concatenate (`a\tab b` → "ab"). A space for `\tab` would be safer.
- **L4** `\uN` fallback skip assumes `\uc1`; a `\uc0` declaration (no fallback byte) would cause one legitimate character to be swallowed per `\uN`. RTFEditorKit emits `\uc1`, so theoretical.
- **L5** `vital()` guard is `n >= 1000` but `numeric(5,2)` overflows from 999.995 upward (rounds to 1000.00) — a value in [999.995, 1000) → insert error instead of warn+null. Practically unreachable for weight/height.
- **L6** Warnings capped at 50 printed lines (:807-809); a dirty production DB can produce hundreds of row-skip warnings the operator never sees. Consider dumping the full list to a file when `> MAX`.
- **L7** H2 medicine-metadata warning is an aggregate count only — the operator must re-open the old app/DB to find which medicines had `preferred_note`. Per-medicine (or first-N) listing would make the manual copy actionable.
- **L8** Recovery after a mid-run `die()` (wipe bsk data, re-run) is implied but never stated in the script header or README — audit M6 asked for it.
- **L9** Dry-run logs "N migrated" for tables written via `insertRows` (cosmetic; header says dry-run writes nothing).
- **L10** Test comment tests/unit/upstream-transforms.test.js:23 says "Midnight 1970-01-01 in VN is -7h UTC" — VN was UTC+8 until 1975, so midnight was -8h; the assertion itself still passes (both -7h and -8h land on 1970-01-01 VN-local). Comment-only.
- **L11** `MS_MIN` is the UTC 1900-01-01 boundary; a VN-midnight DOB exactly 1900-01-01 (-2209014000000) is warned+nulled. Matches the audit's literal proposed bound; negligible.

## 5. Grants migration — OK

`20260818171800_bsk_service_role_grants.sql` is correct and safe:
- `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA bsk` + matching `ALTER DEFAULT PRIVILEGES`. Schema `USAGE` already granted in 20260525163300:112, so the comment's premise checks out.
- RLS posture unchanged: service_role bypasses RLS by design; `authenticated` grants/policies untouched. The migrate script's direct inserts into `checkups`/`order_items`/etc. (tables where `authenticated` has no INSERT) work only through this grant — correct coupling, and README's "after `npm run db:push`" ordering covers it.
- No sequence grants needed: every id is `GENERATED ALWAYS AS IDENTITY` (identity sequences don't require separate USAGE, unlike serial).
- Informational: (a) `DELETE` is broader than any current script needs (seed-geo/migrate use insert/upsert) — conventional for Supabase service_role and the audit-log comment already anticipates service_role writes, so acceptable; (b) `ALTER DEFAULT PRIVILEGES` without `FOR ROLE` binds to the role executing the migration — fine under `supabase db push` (all migrations run as the same role), worth remembering if migration tooling ever changes.

## 6. Tests — behaviors correctly pinned

Verified independently (not just against the plan): the three critical regressions are each pinned — negative-millis DOB (incl. the -25200000 boundary), the removed seconds-heuristic (50000000000 → 1971-08-03, correct under pre-1975 UTC+8 tzdata), exact-0 unset, out-of-window warn; RTF happy path incl. fonttbl skip, `\uN?` fallback skip, `\'hh`, escaped braces, `\par`; shift map both values + warn-once dedupe; `int(null)` vs `int(0)`. No wrong expectations found. Gaps (non-blocking): no test for invalid dd/MM/yyyy (H-A), none for escaped braces inside a skipped group (M-C). Note vitest coverage `include` is `lib/**` only, so these tests add no coverage numbers — fine.

## 7. README / package.json — accurate

README paragraph matches actual behavior: dry-run needs no env vars (script:114-127 confirms), non-empty refusal, WAL copy instructions, migrated/not-migrated lists all match the code (payment state migrates but is always `unpaid` per upstream — "payment state" is technically true; acceptable). `db:migrate-upstream` script wiring correct. Only gap is L8 (recovery procedure).

---

## Recommended actions (priority order)

1. H-A — range-validate dd/MM/yyyy in `vnDate`, warn+null on impossible dates.
2. M-A — gate `line_total` on parseable `total_price`, not mere presence.
3. M-B — dedupe queue-counter payload by (day, shift).
4. M-C — handle `\X` escapes while inside a skipped RTF group.
5. L6/L7/L8 — warning-list dump, per-medicine metadata listing, one recovery sentence in the header/README.

None of these block a commit if the operator plans a `--dry-run` first against the real DB (which surfaces H-A/M-B as hard failures only in the live run — note dry-run canNOT catch them since constraints live in Postgres; that asymmetry is why H-A is High).

## Unresolved questions

1. Does the production `BSK.db` actually contain legacy TEXT DOBs (drives H-A urgency)? A `SELECT customer_dob FROM Customer WHERE customer_dob NOT GLOB '-*[0-9]' AND customer_dob GLOB '*[/-]*'` spot-check would answer it.
2. Upstream `DailyQueueCounter` PK/uniqueness on (date, shift) — unverifiable from the shallow clone (drives M-B).
