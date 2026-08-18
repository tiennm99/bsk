# Migration Script vs Real Upstream Source — Compatibility Audit

**Date:** 2026-08-18
**Script:** `scripts/migrate-from-upstream.mjs`
**Upstream:** local clone at scratchpad `upstream-bsk` (commit 260817c, single-commit shallow clone — no history)
**Target schema:** `supabase/migrations/*.sql`
All upstream file refs below are under `src/main/java/BsK/`.

---

## 1. Verified assumptions (grep-confirmed, no action needed)

| Assumption | Verdict | Evidence |
|---|---|---|
| Table set: Clinic, provinces, wards, Doctor, Medicine, Service, CheckupTemplate, Customer, Checkup, OrderItem, CheckupService, MedicineOrder, DailyQueueCounter, User | **Complete — no missed tables** | Full grep of `INSERT INTO/DELETE FROM/UPDATE/FROM` across `server/` matches exactly this set |
| Checkup.status literals | **"CHỜ KHÁM" / "ĐANG KHÁM" / "ĐÃ KHÁM" only** — all three in STATUS_MAP | creation: `client/ui/component/common/AddDialog/AddDialog.java:666`; combo: `CheckUpPage.java:858`; auto-status-on-print config writes "ĐÃ KHÁM" only (`CheckUpPage.java:2015-2017`, `config/config.properties:3`); server filters on "ĐÃ KHÁM" (`ServerHandler.java:277`). English fallbacks in STATUS_MAP are dead but harmless |
| customer_gender values | **"Nam" / "Nữ"** — covered by GENDER_MAP (norm NFC+upper) | `AddDialog.java:477`, `CheckUpPage.java:633` |
| template_gender values | **"Chung" / "Nam" / "Nữ"** — covered by tplGender | `TemplateDialog.java:152` |
| checkup_date = epoch millis (VN instant) | Confirmed; vnDate VN-tz formatting is correct | write `ServerHandler.java:733-744` (`toInstant().toEpochMilli()`, `setLong`); queue filter `ServerHandler.java:134` (`date(a.checkup_date / 1000, 'unixepoch', '+7 hours')`) |
| customer_dob = epoch millis (midnight VN), may also be legacy TEXT dd/MM/yyyy | Confirmed (but see Critical #3 — negatives) | write `AddDialog.java:867-871`; read handles both `"-?\d+"` and dd/MM/yyyy (`AddDialog.java:1114-1120`) |
| reCheckupDate = Long epoch millis | Confirmed; script's lowercased `recheckupdate` key is right | `common/packet/req/SaveCheckupRequest.java:24`, `ServerHandler.java:997` |
| DailyQueueCounter: `(date, shift, current_count)`, date = TEXT ISO `date('now','+7 hours')` | Confirmed; vnDate ISO branch handles it | `ServerHandler.java:686-690, 833` |
| Money = DOUBLE VND | Confirmed everywhere (`setDouble` for med_selling_price, service_cost, total_amount, total_cost) | `ServerHandler.java:948, 1917-1924, 1049` |
| MedicineOrder ≤ 1 live row per checkup; PK = prescription_id | Confirmed: AddCheckup inserts stub `(checkup_id, customer_id, processed_by)`; SaveCheckup `DELETE WHERE checkup_id` then reinserts. byCheckup dedupe is correct | `ServerHandler.java:757, 930-943` |
| Checkup.prescription_id is a real column | Confirmed (`UPDATE Checkup SET prescription_id`); dropping it is fine — target keys order data by checkup_id | `ServerHandler.java:775, 989` |
| Clinic = `(name, address, phone, prefix)`, singleton read | Confirmed (`LIMIT 1`); multi-row warning in script is fine | `ServerHandler.java:344` |
| Doctor / Service / User column lists | Match script exactly | `ServerHandler.java:2047, 1986/2449, 2112` |
| Medicine columns | Full set: med_id, med_name, med_company, **med_description**, med_unit, med_selling_price, **preferred_note**, **supplement**, deleted, route (see High #5) | `ServerHandler.java:1911-1926, 2489-2497` |
| queue_number = plain int | Confirmed (`setInt`) | `ServerHandler.java:741` |
| CheckupTemplate has no `deleted` column (hard DELETE); `visible` boolean drives soft-delete | Confirmed — script's `visible`→`deleted` inversion OK | `ServerHandler.java:1161-1171` (INSERT cols), DELETE FROM CheckupTemplate exists |
| photo_num stored as TEXT ("3") | Confirmed (`setString`); script `int()` coerces fine | `ServerHandler.java:1174` |
| User skip + roster print, no password output | Sound; upstream stores plaintext passwords — correctly not reused | `ServerHandler.java:2112` |
| Upstream Checkup deletes are hard deletes (no `deleted` col) | Confirmed — `bool(undefined)=false` is right | `ServerHandler.java:1462-1465` |
| OrderItem values stored as TEXT via `setString` (med_id, quantity, prices) | Confirmed — script's `Number()` coercion handles it | `ServerHandler.java:966-980` |

---

## 2. Critical defects

### C1. Shift values are 0/1, not 1–3 — every checkup's shift is wrong or lost
Upstream has exactly two shifts: **0 = morning, 1 = afternoon**.
- `client/LocalStorage.java:27` — `public static int currentShift = 0; // 0 for morning, 1 for afternoon`
- `client/ui/component/LoginPage/LoginPage.java:145,154` — `shiftComboBox.getSelectedIndex() - 1`
- Written verbatim: `ServerHandler.java:742` (`setInt(6, shift)`) and DailyQueueCounter upserts (`ServerHandler.java:686-690`).

Target seeds shifts **1=morning, 2=afternoon, 3=evening** (`supabase/migrations/20260725115000_bsk_checkups.sql:35-39`).

Script (`migrate-from-upstream.mjs:566`, `:716`) keeps `shift` as-is with a 1–3 guard. Result:
- All **morning** checkups (shift=0) → `shift_id NULL` (silently, no warning — guard produces null without warn).
- All **afternoon** checkups (shift=1) → labeled **morning**.
- All morning `DailyQueueCounter` rows skipped; afternoon rows written to the wrong shift.

**Fix:** `const SHIFT_MAP = { 0: 1, 1: 2 };` apply in both `migrateCheckups` and `migrateQueueCounters`; warn on any other value. Optionally probe `SELECT DISTINCT shift FROM Checkup` at startup and die on unexpected values.

### C2. CheckupTemplate.content is RTF markup, not newline-separated field labels
Content is produced by Swing `RTFEditorKit.write(...)` and read back with `RTFEditorKit.read(...)`:
- `TemplateDialog.java:194-197` (JTextPane `text/rtf`), `:836-840` (save → RTF string), `:812-821` (load).
- Semantics: it pre-fills the checkup **notes body**, not a field list — `CheckUpPage.java:5542-5543` reads it straight into `notesField`.

Script (`migrate-from-upstream.mjs:469-473`) splits `content` on newlines → `fields: [{label}]`. Migrated templates will contain RTF control-word garbage (`{\rtf1\ansi\ansicpg1252...`, `\par`, font tables) as "field labels" — unusable and ugly in the UI (`lib/templates/template-schema.js` expects human labels).

**Fix options (in order of preference):**
1. Detect `content.startsWith("{\\rtf")` → extract plain text (strip groups/control words, map `\par`→newline; RTFEditorKit output is simple enough for a small regex-based stripper), then split lines.
2. Or skip `fields` entirely for RTF content, migrate name/title/gender/photo_num only, and warn that field layouts must be rebuilt by the admin.
Legacy plain-text content exists too (`TemplateDialog.java:821` fallback), so keep the line-split for the non-RTF case.

### C3. vnDate loses pre-1970 DOBs and corrupts 1970–1973 dates
DOB is dd/MM/yyyy parsed at midnight VN → `Date.getTime()` epoch millis, **negative for births before 1970** (`AddDialog.java:867-871`; negative timestamps explicitly expected at `AddDialog.java:1114`, regex `"-?\\d+"`).

`vnDate` (`migrate-from-upstream.mjs:189-193`):
- `ms <= 0` → **null**: every patient born before 1970 loses their DOB, **silently** (no warning path).
- `ms < 1e11 → *1000` "seconds" heuristic: DOBs 1970-01-01…1973-03-03 (0 < ms < 1e11) are multiplied by 1000 → bogus far-future dates (e.g. DOB 1971-06-01 → year ~3364), inserted without error (target `customers.dob` is unconstrained `date`).

The seconds heuristic protects against a format that **does not exist upstream**: every numeric date column is written with `setLong(millis)`; the only TEXT date is DailyQueueCounter's ISO string. In a clinic DB, pre-1973 birth dates are common; this is guaranteed data corruption/loss.

**Fix:** remove the `*1000` heuristic and the `ms <= 0` rejection; accept any finite millis within a sane window (e.g. 1900-01-01 = -2208988800000 … now+1y), warn+null outside it.

---

## 3. High priority

### H1. CheckupService.notes silently dropped
Upstream writes and reads per-service-line notes: INSERT `ServerHandler.java:1024` (`notes` col), read back `ServerHandler.java:1122-1145` (`CS.notes`). Target `bsk.checkup_services` has **no notes column** (`20260725121000_bsk_billing.sql:37-44`) and the script never touches it — data lost with no warning and no mention in the script header/mapping docs.
**Fix:** either append non-empty service notes to the checkup's `notes` (`Dịch vụ X: …`), or accept the loss explicitly (warn + document). Note `order_items.notes` *is* migrated — the asymmetry looks like an oversight, not a decision.

### H2. Medicine.preferred_note / med_description / supplement dropped
Confirmed real, populated, user-facing columns (`ServerHandler.java:2489-2497`; `supplement`/`route` are even re-read per order line at `:1069-1075` to group supplements separately on printed prescriptions). Target `bsk.medicines` has no equivalents (`20260725120000_bsk_catalog.sql:8-18`). `preferred_note` typically holds the doctor's default dosage text — losing it degrades prescribing workflow after cutover.
**Fix:** at minimum warn per-medicine when these are non-empty and document the decision; better, fold `preferred_note`+`med_description` into a text column if the rewrite grows one, or park them in a migration-notes dump file for the admin.

### H3. Checkup.doctor_ultrasound_id dropped
Second (ultrasound) doctor is written on every SaveCheckup (`ServerHandler.java:1005`) and shown/printed (queue SELECT `:126`). Target checkups has a single `doctor_id`. Loss is plausible-by-design but is not mentioned in the script comments or warnings.
**Fix:** document, or fold `Đề nghị`-style into notes (`BS siêu âm: <name>` via Doctor lookup).

### H4. Legacy OrderItem rows may lack checkup_id → silent skip
Current code always sets `OrderItem.checkup_id` (`ServerHandler.java:966-978`), but the DeleteCheckup path still resolves items via `prescription_id IN (SELECT prescription_id FROM MedicineOrder WHERE checkup_id = ?)` (`ServerHandler.java:1462`) — evidence the schema predates `checkup_id` on OrderItem, so old production rows may have NULL there. Script would skip them (warn per row).
**Fix:** fallback join: build `prescriptionId → checkup_id` from MedicineOrder rows and use it when `r.checkup_id` is null/unmapped. Cheap insurance; shallow clone prevents confirming history (see Unresolved).

---

## 4. Medium priority

- **M1. Checkup.remind_date dropped — mapping report Q5 now answered: it IS used.** Written by AddRemindDateRequest (`ServerHandler.java:1662`), read for the reminders list (`:2618, :2649`, epoch millis via `getLong`). Distinct from reCheckupDate (both selected side by side at `:2618`). Target has only `recheck_date`. Decide: fold into `recheck_date` when recheck is null, or document the drop.
- **M2. Upstream geo migration is zero-value and risky — prefer dropping it.** Customers carry no province/ward codes upstream (flat address string), so migrated geo rows are referenced by nothing. Upstream `wards` may not even have a `code` column (server only ever reads `name`,`province_code` — `ServerHandler.java:560`); if absent, the script's `str(w.code)` filter silently drops **all** wards while still inserting provinces, leaving a half-seeded, possibly pre-2025-merger code space that `db:seed-geo` (operator-supplied dataset, `scripts/seed-geo.mjs`) will then collide/mix with. Recommend deleting `migrateGeo()` and always directing the operator to `db:seed-geo` — one less failure mode.
- **M3. Address string contains recoverable ward/province.** `AddDialog.java:845-847`: `address = String.join(", ", customerAddress, ward, province)`. The script's claim "province/ward codes have no upstream source" (header line ~30) is inaccurate — the *names* are the last two comma-separated tokens. A best-effort suffix match against the geo tables could backfill most customers. At minimum fix the comment; optionally implement parse-with-warning.
- **M4. Vitals garbage passthrough.** `heart_beat` is INTEGER (`setInt`, `SaveCheckupRequest.java:37`) — unfilled visits store 0 and migrate as text `"0"`; `blood_pressure` unfilled becomes `"0/0"` (spinner join, `CheckUpPage.java:1997`). Null out `"0"` and `"0/0"` like `vital()` already does for weight/height.
- **M5. WAL copy hazard.** Upstream runs SQLite in WAL mode with 5-min passive checkpoints (`server/database/DatabaseManager.java:28, startPeriodicCheckpoint`). If the operator copies only `BSK.db` while the server is/was running, up to the last checkpoint's worth of visits is silently absent. Add a preflight note (or check for a sibling `-wal` file and warn/die) and document "stop server, checkpoint or copy all three files".
- **M6. No atomicity.** `die()` mid-run leaves a partially migrated target; preflight emptiness check covers only 4 of 10 written tables (`main()` — customers/checkups/medicines/services; doctors, templates, clinic, geo, counters unchecked). Re-run after failure will duplicate the unchecked tables even without `--allow-nonempty`. Extend the preflight list and document the recovery procedure (wipe bsk data, re-run).

## 5. Low priority

- `PAID_LABELS` is speculative dead code: the upstream commit never writes any paid value — only `"Unpaid"` (`ServerHandler.java:953`) or NULL (stub insert `:757`). All orders migrate as `unpaid`, `paid_at` always null. Harmless; keep as belt-and-braces, but don't expect paid rows.
- `MedicineOrder.total_amount`/`processed_by` dropped — fine (derivable / user FK not migrated), worth a line in the header comment.
- `migrateGeo` logs pre-filter row counts ("N wards migrated" even when the filter dropped rows).
- `money()` clamps negatives to 0 silently — add a warn (discount/typo rows would be masked).
- `int()` truncates decimal quantity strings silently ("1.5" → 1).
- Unknown-status fallback to `done` is reasonable and warned — OK as-is.

## 6. Script/PostgREST mechanics reviewed — OK

- Chunked insert + `.select("id")` order matches input order (PostgREST returns representation in insert order); length mismatch is checked.
- `medicine_orders` upsert on PK checkup_id, `daily_queue_counters` upsert on (day, shift_id), `clinic_settings` pinned `id: true` CHECK — all match target DDL.
- `checkups` explicit `created_at`/`updated_at` inserts are legal (plain defaults, trigger is BEFORE UPDATE only); `numeric(5,2)` vitals guard (`n >= 1000`) aligns with column precision.
- Enum values `waiting|in_progress|done`, `unpaid|paid`, template gender CHECK, customers gender CHECK — script outputs only legal values.
- Dry-run paths, read-only SQLite open, case-insensitive table/column probing: sound.

---

## Unresolved questions

1. **Historical value drift** — the clone is a 1-commit shallow clone; older app versions may have written other status strings, shift conventions, or OrderItem rows without checkup_id. Only the production `BSK.db` can answer (`SELECT DISTINCT status FROM Checkup; SELECT DISTINCT shift FROM Checkup; SELECT COUNT(*) FROM OrderItem WHERE checkup_id IS NULL`). Recommend the script assert these at startup instead of assuming.
2. **wards.code existence** — undecidable from source (server never selects it). Moot if M2 (drop upstream geo) is accepted.
3. **CheckupTemplate content mix** — how many production templates are RTF vs legacy plain text; determines whether an RTF stripper is worth writing vs skipping `fields`.
4. **Whether losing preferred_note/supplement/doctor_ultrasound_id/remind_date is accepted product scope** — user decision, per review rules; the script currently loses them without surfacing the choice.

---

Status: DONE_WITH_CONCERNS
Summary: Verified every mapping against the real Java source; found 3 critical defects (shift 0/1 vs 1–3 mismapping, RTF template content migrated as field labels, pre-1970/1973 DOB loss+corruption in vnDate) plus silent drops of checkup_service notes, medicine preferred_note/supplement, doctor_ultrasound_id and remind_date.
Concerns/Blockers: Production DB may contain legacy value variants a 1-commit clone cannot reveal — recommend runtime DISTINCT-value assertions before the real run.
