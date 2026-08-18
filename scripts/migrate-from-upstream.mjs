#!/usr/bin/env node
/**
 * Migrate data from an original BSK desktop install (Java/Swing + SQLite,
 * https://github.com/lds217/BSK-All-in-One-Clinic-Management-System) into this
 * rewrite's Supabase `bsk` schema.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
 *     npm run db:migrate-upstream -- /path/to/BSK.db [--dry-run] [--allow-nonempty]
 *
 *   --dry-run         Read + transform only; prints what would be migrated and
 *                     every warning. Needs no Supabase env vars.
 *   --allow-nonempty  Skip the "target must be empty" preflight (the script
 *                     re-keys all ids, so re-running WILL duplicate rows —
 *                     only use this when you know what you are doing).
 *
 * IMPORTANT — the upstream server runs SQLite in WAL mode with periodic
 * checkpoints. Stop the Java server before copying, and copy BSK.db TOGETHER
 * with its BSK.db-wal / BSK.db-shm siblings (or run `PRAGMA wal_checkpoint;`
 * first) — otherwise the most recent visits are silently missing.
 *
 * Field-level mapping decisions are documented in
 * plans/reports/researcher-260818-1712-upstream-sqlite-to-supabase-migration-
 * mapping-report.md, and every assumption below was verified against the real
 * Java source in plans/reports/code-reviewer-260818-1749-migration-script-
 * upstream-compat-audit-report.md. Highlights:
 *   - All primary keys are re-keyed (target uses GENERATED ALWAYS AS IDENTITY);
 *     foreign keys are remapped via in-memory old→new id maps.
 *   - Money: upstream DOUBLE VND → integer VND (rounded, clamped to >= 0).
 *   - Dates: upstream stores epoch millis (negative for pre-1970 birth dates)
 *     → clinic-local (UTC+7) DATE.
 *   - Shifts: upstream 0=morning / 1=afternoon → target shift_id 1 / 2.
 *   - Enum-ish text (status, gender, payment) is translated from the exact
 *     labels the Java app writes; unknown values fall back with a warning.
 *   - Template `content` is RTF (Swing RTFEditorKit); it is converted to plain
 *     text and each line becomes one field label — review templates after.
 *   - Folded into the visit's notes (no dedicated target column): the
 *     "suggestion" text, per-service-line notes, and the ultrasound doctor.
 *     remind_date is used as recheck_date when reCheckupDate is empty.
 *   - Dropped (no target column; warned when populated): medicine
 *     preferred_note / description / supplement flag, order processed_by /
 *     total_amount (total is recomputed from line items by the app).
 *   - Staff accounts are NOT migrated (auth lives in Supabase now, upstream
 *     passwords must not be reused). The upstream roster is printed so the
 *     admin can re-invite staff via the app's staff-management UI.
 *   - Patient media (Google Drive ids) stays behind. province/ward codes are
 *     left NULL — upstream appends ", ward, province" NAMES to the address
 *     string, so they remain readable there; backfill codes in the UI. Geo
 *     reference data always comes from `npm run db:seed-geo`, never upstream.
 *
 * Requires Node >= 24 (uses the built-in node:sqlite driver, read-only).
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createClient } from "@supabase/supabase-js";
import {
  GENDER_MAP,
  PAID_LABELS,
  STATUS_MAP,
  bool,
  int,
  mapShift,
  money,
  norm,
  rtfToText,
  setOnWarn,
  str,
  vnDate,
} from "./upstream-transforms.mjs";

/** @typedef {string | number | bigint | Uint8Array | null} SqlValue */
/** @typedef {Record<string, SqlValue>} Row */

/**
 * @param {string} msg
 * @returns {never}
 */
function die(msg) {
  process.stderr.write(`\n[migrate-upstream] ERROR: ${msg}\n\n`);
  process.exit(1);
}

/** @type {string[]} */
const warnings = [];
/** @param {string} msg */
function warn(msg) {
  warnings.push(msg);
}
setOnWarn(warn); // transforms report dropped/odd values through the same sink

/** @param {string} msg */
function log(msg) {
  process.stdout.write(`[migrate-upstream] ${msg}\n`);
}

// ─── CLI / env ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const allowNonempty = args.includes("--allow-nonempty");
const dbArg = args.find((a) => !a.startsWith("--"));
if (!dbArg) {
  die("Usage: npm run db:migrate-upstream -- /path/to/BSK.db [--dry-run] [--allow-nonempty]");
}
const dbPath = resolve(process.cwd(), dbArg);
if (!existsSync(dbPath)) die(`SQLite file not found: ${dbPath}`);

/** @typedef {import("@supabase/supabase-js").SupabaseClient<any, any, "bsk">} BskClient */

/** @type {BskClient | null} */
let supabase = null;
if (!dryRun) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    die(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY in the environment " +
        "(or pass --dry-run to preview without writing).",
    );
  }
  supabase = createClient(url, key, {
    db: { schema: "bsk" },
    auth: { persistSession: false },
  });
}

// ─── SQLite helpers (schema-tolerant: the upstream app evolved, so we probe
//     tables/columns instead of assuming the exact shape) ─────────────────────

const sqlite = new DatabaseSync(dbPath, { readOnly: true });

/**
 * Actual table name in the file for a case-insensitive lookup, or null.
 * @param {string} name
 * @returns {string | null}
 */
function findTable(name) {
  const row = /** @type {Row | undefined} */ (
    sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND lower(name) = lower(?)")
      .get(name)
  );
  return row ? String(row.name) : null;
}

/**
 * All rows of a table with keys lowercased, or [] when the table is absent.
 * @param {string} name
 * @returns {Row[]}
 */
function readTable(name) {
  const actual = findTable(name);
  if (!actual) return [];
  const rows = /** @type {Row[]} */ (sqlite.prepare(`SELECT * FROM "${actual}"`).all());
  return rows.map((r) => {
    /** @type {Row} */
    const out = {};
    for (const [k, v] of Object.entries(r)) out[k.toLowerCase()] = v;
    return out;
  });
}

// ─── Supabase write helpers ───────────────────────────────────────────────────

let dryRunIdCounter = -1;
const CHUNK = 400;

/**
 * Requires the live client (never called in --dry-run).
 * @returns {BskClient}
 */
function sb() {
  if (!supabase) die("internal: supabase client used in dry-run");
  return supabase;
}

/**
 * Inserts rows in chunks and returns the generated ids in input order
 * (PostgREST returns representations in insertion order). Dry-run hands back
 * placeholder negative ids so dependent transforms still run.
 * @param {string} table
 * @param {Record<string, unknown>[]} rows
 * @returns {Promise<number[]>}
 */
async function insertReturningIds(table, rows) {
  if (dryRun) return rows.map(() => dryRunIdCounter--);
  /** @type {number[]} */
  const ids = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const { data, error } = await sb()
      .from(table)
      .insert(/** @type {never[]} */ (batch))
      .select("id");
    if (error) die(`Insert into ${table} failed at row ${i}: ${error.message}`);
    for (const r of /** @type {{ id: number }[]} */ (data ?? [])) ids.push(r.id);
  }
  if (ids.length !== rows.length) {
    die(`Insert into ${table}: expected ${rows.length} returned ids, got ${ids.length}`);
  }
  return ids;
}

/**
 * Chunked insert without id mapping (line items, counters).
 * @param {string} table
 * @param {Record<string, unknown>[]} rows
 * @param {{ upsert?: boolean }} [opts]
 * @returns {Promise<void>}
 */
async function insertRows(table, rows, opts = {}) {
  if (dryRun) return;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = /** @type {never[]} */ (rows.slice(i, i + CHUNK));
    const { error } = opts.upsert
      ? await sb().from(table).upsert(batch)
      : await sb().from(table).insert(batch);
    if (error) die(`Write into ${table} failed at row ${i}: ${error.message}`);
  }
}

/**
 * Row count of a target table (0 in dry-run: no remote access).
 * @param {string} table
 * @returns {Promise<number>}
 */
async function targetCount(table) {
  if (dryRun) return 0;
  const { count, error } = await sb().from(table).select("*", { count: "exact", head: true });
  if (error) die(`Counting bsk.${table} failed: ${error.message}`);
  return count ?? 0;
}

// ─── Migration steps (FK dependency order) ────────────────────────────────────

/** @returns {Promise<void>} */
async function migrateClinicSettings() {
  const rows = readTable("Clinic");
  const first = rows[0];
  if (!first) {
    log("clinic settings: none found upstream — skipped");
    return;
  }
  if (rows.length > 1) warn(`Clinic has ${rows.length} rows; only the first was migrated.`);
  await insertRows(
    "clinic_settings",
    [
      {
        id: true,
        name: str(first.name),
        address: str(first.address),
        phone: str(first.phone),
        prefix: str(first.prefix),
      },
    ],
    { upsert: true },
  );
  log("clinic settings: 1 migrated");
}

// NOTE: upstream provinces/wards tables are deliberately NOT migrated. No
// upstream customer row references them (the address is one flat string), and
// their vintage/code space would collide with the operator-chosen dataset —
// geo reference data always comes from `npm run db:seed-geo`.

/**
 * @returns {Promise<{ map: Map<number, number>, nameOf: Map<number, string> }>}
 */
async function migrateDoctors() {
  const rows = readTable("Doctor");
  const usable = rows.filter((r) => int(r.doctor_id) != null);
  const ids = await insertReturningIds(
    "doctors",
    usable.map((r) => ({
      first_name: str(r.doctor_first_name) ?? "",
      last_name: str(r.doctor_last_name) ?? "",
      deleted: bool(r.deleted),
    })),
  );
  const map = new Map(usable.map((r, i) => [Number(r.doctor_id), /** @type {number} */ (ids[i])]));
  // Display names ("last first", Vietnamese order) for notes annotations.
  const nameOf = new Map(
    usable.map((r) => [
      Number(r.doctor_id),
      [str(r.doctor_last_name), str(r.doctor_first_name)].filter(Boolean).join(" "),
    ]),
  );
  log(`doctors: ${usable.length} migrated`);
  return { map, nameOf };
}

/** @returns {Promise<Map<number, number>>} */
async function migrateMedicines() {
  const rows = readTable("Medicine");
  const usable = rows.filter((r) => {
    if (int(r.med_id) == null || !str(r.med_name)) {
      warn(`Medicine row skipped (missing med_id or med_name): ${JSON.stringify(r).slice(0, 120)}`);
      return false;
    }
    return true;
  });
  const ids = await insertReturningIds(
    "medicines",
    usable.map((r) => ({
      name: str(r.med_name),
      unit: str(r.med_unit),
      sale_price: money(r.med_selling_price),
      company: str(r.med_company),
      route: str(r.route),
      deleted: bool(r.deleted),
    })),
  );
  const map = new Map(usable.map((r, i) => [Number(r.med_id), /** @type {number} */ (ids[i])]));
  // The target catalog deliberately has no description/preferred-note columns;
  // surface how much of that metadata exists so the operator can copy what
  // matters (e.g. preferred dosage notes) into the new catalog by hand.
  const withMeta = usable.filter(
    (r) => str(r.preferred_note) ?? str(r.med_description) ?? (bool(r.supplement) || null),
  ).length;
  if (withMeta > 0) {
    warn(
      `${withMeta} medicine(s) carry preferred_note/description/supplement metadata ` +
        "that has no target column — review the upstream catalog before retiring it",
    );
  }
  log(`medicines: ${usable.length} migrated (${rows.length - usable.length} skipped)`);
  return map;
}

/** @returns {Promise<Map<number, number>>} */
async function migrateServices() {
  const rows = readTable("Service");
  const usable = rows.filter((r) => {
    if (int(r.service_id) == null || !str(r.service_name)) {
      warn(
        `Service row skipped (missing service_id or service_name): ${JSON.stringify(r).slice(0, 120)}`,
      );
      return false;
    }
    return true;
  });
  const ids = await insertReturningIds(
    "services",
    usable.map((r) => ({
      name: str(r.service_name),
      price: money(r.service_cost),
      deleted: bool(r.deleted),
    })),
  );
  const map = new Map(usable.map((r, i) => [Number(r.service_id), /** @type {number} */ (ids[i])]));
  log(`services: ${usable.length} migrated (${rows.length - usable.length} skipped)`);
  return map;
}

/** @returns {Promise<void>} */
async function migrateTemplates() {
  const rows = readTable("CheckupTemplate");
  if (rows.length === 0) {
    log("checkup templates: none found upstream — skipped");
    return;
  }
  rows.sort((a, b) => (int(a.stt) ?? 0) - (int(b.stt) ?? 0));
  /** @type {Record<string, "any" | "male" | "female" | "other">} */
  const tplGender = { ...GENDER_MAP, ANY: "any", ALL: "any", "CẢ HAI": "any", CHUNG: "any" };
  await insertRows(
    "checkup_templates",
    rows.map((r, i) => ({
      name: str(r.template_name) ?? str(r.template_title) ?? `Template ${i + 1}`,
      title: str(r.template_title),
      gender: tplGender[norm(r.template_gender)] ?? "any",
      photo_num: Math.max(0, int(r.photo_num) ?? 0),
      // Target stores fields as an ordered [{ label }] jsonb array
      // (lib/templates/template-schema.js). Upstream `content` is RTF from the
      // Swing editor (legacy rows may be plain text) that pre-filled the notes
      // body; after RTF→text each non-empty line becomes one field label.
      // print_type/conclusion/suggestion/diagnosis defaults have no target.
      fields: rtfToText(str(r.content) ?? "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((label) => ({ label })),
      deleted: bool(r.deleted) || (r.visible != null && !bool(r.visible)),
    })),
  );
  warn(
    "Checkup templates were converted from the upstream RTF editor — review their " +
      "field lists in the admin UI before first use.",
  );
  // The default-text columns (print_type, conclusion, suggestion, diagnosis)
  // have no target — surface how many templates carry them so the operator
  // can copy anything worth keeping into the new template fields by hand.
  const withDefaults = rows.filter(
    (r) => str(r.print_type) ?? str(r.conclusion) ?? str(r.suggestion) ?? str(r.diagnosis),
  ).length;
  if (withDefaults > 0) {
    warn(
      `${withDefaults} template(s) carry print_type/conclusion/suggestion/diagnosis ` +
        "default text that has no target column — copy what matters from the upstream app",
    );
  }
  log(`checkup templates: ${rows.length} migrated`);
}

/** @returns {Promise<Map<number, number>>} */
async function migrateCustomers() {
  const rows = readTable("Customer");
  const usable = rows.filter((r) => int(r.customer_id) != null);
  const ids = await insertReturningIds(
    "customers",
    usable.map((r) => {
      const gender = GENDER_MAP[norm(r.customer_gender)] ?? null;
      if (gender === null && str(r.customer_gender)) {
        warn(`Customer ${r.customer_id}: unknown gender "${r.customer_gender}" → NULL`);
      }
      return {
        first_name: str(r.customer_first_name) ?? "",
        last_name: str(r.customer_last_name) ?? "",
        dob: vnDate(r.customer_dob),
        gender,
        cccd: str(r.cccd_ddcn),
        phone: str(r.customer_number),
        // Upstream stores one flat address string; province/ward codes have no
        // source and stay NULL for the admin to backfill in the UI.
        address_detail: str(r.customer_address),
      };
    }),
  );
  const map = new Map(
    usable.map((r, i) => [Number(r.customer_id), /** @type {number} */ (ids[i])]),
  );
  log(`customers: ${usable.length} migrated`);
  return map;
}

/**
 * Per-service-line notes from CheckupService (the target table has no notes
 * column, so they are folded into the visit's notes instead of being lost).
 * @returns {Map<number, string[]>} upstream checkup_id → note lines
 */
function collectServiceNoteLines() {
  /** @type {Map<number, string>} */
  const serviceNameOf = new Map(
    readTable("Service").map((s) => [
      Number(s.service_id),
      str(s.service_name) ?? `#${s.service_id}`,
    ]),
  );
  /** @type {Map<number, string[]>} */
  const byCheckup = new Map();
  for (const r of readTable("CheckupService")) {
    const checkupId = int(r.checkup_id);
    const note = str(r.notes);
    if (checkupId == null || !note) continue;
    const name = serviceNameOf.get(Number(r.service_id)) ?? `#${r.service_id}`;
    const lines = byCheckup.get(checkupId) ?? [];
    lines.push(`Dịch vụ ${name}: ${note}`);
    byCheckup.set(checkupId, lines);
  }
  return byCheckup;
}

/**
 * @param {Map<number, number>} customerMap
 * @param {{ map: Map<number, number>, nameOf: Map<number, string> }} doctors
 * @param {Map<number, string[]>} serviceNoteLines upstream checkup_id → lines
 * @returns {Promise<{ map: Map<number, number>, dateOf: Map<number, string> }>}
 */
async function migrateCheckups(customerMap, doctors, serviceNoteLines) {
  const doctorMap = doctors.map;
  const rows = readTable("Checkup");
  /** @type {Row[]} */
  const usable = [];
  /** @type {Set<string>} */
  const unknownStatuses = new Set();
  /** @type {Set<number>} */
  const unknownShifts = new Set();
  for (const r of rows) {
    if (int(r.checkup_id) == null) continue;
    if (!customerMap.has(Number(r.customer_id))) {
      warn(`Checkup ${r.checkup_id}: customer ${r.customer_id} not migrated — row skipped`);
      continue;
    }
    usable.push(r);
  }
  /** @type {Map<number, string>} */
  const dateOf = new Map();
  const payload = usable.map((r) => {
    const oldId = Number(r.checkup_id);
    const date = vnDate(r.checkup_date);
    if (date) dateOf.set(oldId, date);
    else warn(`Checkup ${oldId}: unparseable checkup_date "${r.checkup_date}" → defaults to today`);

    let status = STATUS_MAP[norm(r.status)];
    if (!status) {
      if (str(r.status)) unknownStatuses.add(String(r.status));
      status = "done"; // migrated history is overwhelmingly completed visits
    }

    const doctorId = int(r.doctor_id);
    if (doctorId != null && !doctorMap.has(doctorId)) {
      warn(`Checkup ${oldId}: doctor ${doctorId} not migrated → doctor left empty`);
    }

    /** @param {SqlValue | undefined} v */
    const vital = (v) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) return null;
      // numeric(5,2) tops out at 999.99; values from 999.995 round past it.
      if (n >= 999.995) {
        warn(`Checkup ${oldId}: vital value ${n} out of range → NULL`);
        return null;
      }
      return n;
    };

    // Data with no dedicated target column is folded into the visit notes so
    // nothing clinically visible in the old app is lost.
    const ultrasoundDoctorId = int(r.doctor_ultrasound_id);
    const ultrasoundName =
      ultrasoundDoctorId != null ? doctors.nameOf.get(ultrasoundDoctorId) : null;
    const suggestion = str(r.suggestion);
    const noteLines = [
      str(r.notes),
      suggestion ? `Đề nghị: ${suggestion}` : null,
      ultrasoundName ? `BS siêu âm: ${ultrasoundName}` : null,
      ...(serviceNoteLines.get(oldId) ?? []),
    ].filter(Boolean);

    // Unfilled vitals are stored as 0 / "0/0" upstream — treat them as unset.
    const heartBeat = str(r.heart_beat);
    const bloodPressure = str(r.blood_pressure);
    return {
      customer_id: customerMap.get(Number(r.customer_id)),
      doctor_id: doctorId != null ? (doctorMap.get(doctorId) ?? null) : null,
      shift_id: mapShift(r.shift, unknownShifts),
      queue_number: int(r.queue_number),
      ...(date
        ? {
            checkup_date: date,
            // Anchor audit timestamps to the visit day (noon VN) so history
            // and exports sort sensibly instead of piling up on migration day.
            created_at: `${date}T12:00:00+07:00`,
            updated_at: `${date}T12:00:00+07:00`,
          }
        : {}),
      status,
      checkup_type: str(r.checkup_type),
      diagnosis: str(r.diagnosis),
      conclusion: str(r.conclusion),
      notes: noteLines.length > 0 ? noteLines.join("\n") : null,
      heart_beat: heartBeat === "0" ? null : heartBeat,
      blood_pressure: bloodPressure === "0/0" ? null : bloodPressure,
      weight: vital(r.customer_weight),
      height: vital(r.customer_height),
      // remind_date is the upstream recall reminder; it fills recheck_date
      // when no explicit re-checkup date was set (the rewrite's reminders
      // feature reads recheck_date).
      recheck_date: vnDate(r.recheckupdate) ?? vnDate(r.remind_date),
      deleted: bool(r.deleted),
    };
  });
  const ids = await insertReturningIds("checkups", payload);
  const map = new Map(usable.map((r, i) => [Number(r.checkup_id), /** @type {number} */ (ids[i])]));
  if (unknownStatuses.size > 0) {
    warn(
      `Checkup.status values with no mapping (defaulted to 'done'): ` +
        [...unknownStatuses].join(", "),
    );
  }
  log(`checkups: ${usable.length} migrated (${rows.length - usable.length} skipped)`);
  return { map, dateOf };
}

/**
 * @param {Map<number, number>} checkupMap
 * @param {Map<number, number>} medicineMap
 * @returns {Promise<void>}
 */
async function migrateOrderItems(checkupMap, medicineMap) {
  const rows = readTable("OrderItem");
  // Legacy OrderItem rows predate the checkup_id column; resolve them through
  // MedicineOrder's prescription_id → checkup_id, mirroring the upstream
  // DeleteCheckup join.
  /** @type {Map<number, number>} */
  const prescToCheckup = new Map();
  for (const o of readTable("MedicineOrder")) {
    const presc = int(o.prescription_id);
    const checkup = int(o.checkup_id);
    if (presc != null && checkup != null) prescToCheckup.set(presc, checkup);
  }
  /** @type {Record<string, unknown>[]} */
  const payload = [];
  for (const r of rows) {
    const presc = int(r.prescription_id);
    const oldCheckupId =
      int(r.checkup_id) ?? (presc != null ? (prescToCheckup.get(presc) ?? null) : null);
    const checkupId = oldCheckupId != null ? checkupMap.get(oldCheckupId) : undefined;
    const medicineId = medicineMap.get(Number(r.med_id));
    const quantity = int(r.quantity_ordered) ?? 0;
    if (!checkupId || !medicineId || quantity <= 0) {
      warn(
        `OrderItem skipped (checkup ${r.checkup_id}, med ${r.med_id}, qty ${r.quantity_ordered}): ` +
          "missing reference or non-positive quantity",
      );
      continue;
    }
    const unitPrice = money(r.price_per_unit);
    // Trust the stored total only when it actually parses as a number —
    // legacy TEXT values like "" would otherwise become 0 and silently
    // falsify billing history. Anything unparseable is recomputed.
    const storedTotal = str(r.total_price) != null ? Number(r.total_price) : NaN;
    payload.push({
      checkup_id: checkupId,
      medicine_id: medicineId,
      quantity,
      dosage: str(r.dosage),
      unit_price: unitPrice,
      line_total: Number.isFinite(storedTotal) ? money(storedTotal) : quantity * unitPrice,
      notes: str(r.notes),
    });
  }
  await insertRows("order_items", payload);
  log(`order items: ${payload.length} migrated (${rows.length - payload.length} skipped)`);
}

/**
 * @param {Map<number, number>} checkupMap
 * @param {Map<number, number>} serviceMap
 * @returns {Promise<void>}
 */
async function migrateCheckupServices(checkupMap, serviceMap) {
  const rows = readTable("CheckupService");
  /** @type {Record<string, unknown>[]} */
  const payload = [];
  for (const r of rows) {
    const checkupId = checkupMap.get(Number(r.checkup_id));
    const serviceId = serviceMap.get(Number(r.service_id));
    const quantity = int(r.quantity) ?? 0;
    if (!checkupId || !serviceId || quantity <= 0) {
      warn(
        `CheckupService skipped (checkup ${r.checkup_id}, service ${r.service_id}, ` +
          `qty ${r.quantity}): missing reference or non-positive quantity`,
      );
      continue;
    }
    // Upstream stores only the line total; the unit price is derived so the
    // stored total is preserved exactly (rounding differences land on the
    // unit price, which is display-only for migrated history).
    const lineTotal = money(r.total_cost);
    payload.push({
      checkup_id: checkupId,
      service_id: serviceId,
      quantity,
      unit_price: Math.round(lineTotal / quantity),
      line_total: lineTotal,
    });
  }
  await insertRows("checkup_services", payload);
  log(`checkup services: ${payload.length} migrated (${rows.length - payload.length} skipped)`);
}

/**
 * @param {Map<number, number>} checkupMap
 * @param {Map<number, string>} checkupDateOf
 * @returns {Promise<void>}
 */
async function migrateMedicineOrders(checkupMap, checkupDateOf) {
  const rows = readTable("MedicineOrder");
  /** @type {Map<number, Record<string, unknown>>} */
  const byCheckup = new Map();
  let skipped = 0;
  for (const r of rows) {
    const oldCheckupId = Number(r.checkup_id);
    const checkupId = checkupMap.get(oldCheckupId);
    if (!checkupId) {
      warn(`MedicineOrder skipped: checkup ${r.checkup_id} not migrated`);
      skipped++;
      continue;
    }
    const paid = PAID_LABELS.has(norm(r.payment_status));
    const visitDate = checkupDateOf.get(oldCheckupId);
    // Later rows win on duplicates (the upstream app had two INSERT paths).
    byCheckup.set(checkupId, {
      checkup_id: checkupId,
      payment_status: paid ? "paid" : "unpaid",
      // Upstream never recorded when an order was paid; the visit day (noon
      // VN) keeps history plausible without inventing precision.
      paid_at: paid && visitDate ? `${visitDate}T12:00:00+07:00` : null,
    });
  }
  await insertRows("medicine_orders", [...byCheckup.values()], { upsert: true });
  log(`medicine orders: ${byCheckup.size} migrated (${skipped} skipped)`);
}

/** @returns {Promise<void>} */
async function migrateQueueCounters() {
  const rows = readTable("DailyQueueCounter");
  /** @type {Set<number>} */
  const unknownShifts = new Set();
  // Deduplicate on the target PK (day, shift_id) keeping the highest counter —
  // duplicate source rows would make the upsert fail with "ON CONFLICT ...
  // cannot affect row a second time".
  /** @type {Map<string, { day: string, shift_id: number, last_number: number }>} */
  const byKey = new Map();
  for (const r of rows) {
    const day = vnDate(r.date);
    const shiftId = mapShift(r.shift, unknownShifts);
    if (!day || shiftId == null) {
      warn(`DailyQueueCounter skipped (date ${r.date}, shift ${r.shift})`);
      continue;
    }
    const key = `${day}|${shiftId}`;
    const lastNumber = Math.max(0, int(r.current_count) ?? 0);
    const existing = byKey.get(key);
    if (existing) existing.last_number = Math.max(existing.last_number, lastNumber);
    else byKey.set(key, { day, shift_id: shiftId, last_number: lastNumber });
  }
  const payload = [...byKey.values()];
  await insertRows("daily_queue_counters", payload, { upsert: true });
  log(`queue counters: ${payload.length} migrated (${rows.length - payload.length} skipped)`);
}

/**
 * Staff accounts are intentionally not migrated: auth is delegated to Supabase
 * and upstream passwords must not be reused. Print the roster so the admin can
 * re-invite everyone through the staff-management UI.
 * @returns {void}
 */
function reportUpstreamUsers() {
  const rows = readTable("User");
  if (rows.length === 0) return;
  log("");
  log(`staff accounts are NOT migrated — re-invite these ${rows.length} upstream users`);
  log("via the app's staff management (Supabase auth replaces upstream passwords):");
  for (const r of rows) {
    const name = [str(r.last_name), str(r.first_name)].filter(Boolean).join(" ") || "(no name)";
    const flags = bool(r.deleted) ? " [deleted upstream — probably skip]" : "";
    log(`  - ${str(r.user_name) ?? "?"} — ${name}, role: ${str(r.role_name) ?? "?"}${flags}`);
  }
}

/**
 * Prints what the source actually contains before anything is written — the
 * value spaces this script's mappings depend on (older app versions may have
 * written variants the current Java source no longer shows).
 * @returns {void}
 */
function sourceOverview() {
  if (existsSync(`${dbPath}-wal`)) {
    log("note: a BSK.db-wal sibling exists and will be read through — good");
  } else {
    warn(
      "No BSK.db-wal sibling found. The upstream server runs WAL mode: if this file was " +
        "copied while the server was running, the newest visits may be missing — stop the " +
        "server and re-copy BSK.db together with its -wal/-shm files if unsure.",
    );
  }
  /**
   * @param {string} table
   * @param {string} column
   * @returns {string[]}
   */
  const distinct = (table, column) => {
    const actual = findTable(table);
    if (!actual) return [];
    return /** @type {Row[]} */ (
      sqlite.prepare(`SELECT DISTINCT "${column}" AS v FROM "${actual}"`).all()
    ).map((r) => String(r.v));
  };
  const statuses = distinct("Checkup", "status");
  const shifts = distinct("Checkup", "shift");
  if (statuses.length > 0) log(`source Checkup.status values: ${statuses.join(", ")}`);
  if (shifts.length > 0) log(`source Checkup.shift values: ${shifts.join(", ")}`);
  const orderItem = findTable("OrderItem");
  if (orderItem) {
    const row = /** @type {Row | undefined} */ (
      sqlite.prepare(`SELECT COUNT(*) AS n FROM "${orderItem}" WHERE checkup_id IS NULL`).get()
    );
    const n = Number(row?.n ?? 0);
    if (n > 0) log(`source OrderItem rows without checkup_id (legacy): ${n}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log(`source: ${dbPath}${dryRun ? " (dry run — nothing will be written)" : ""}`);
  sourceOverview();

  if (!dryRun && !allowNonempty) {
    // Ids are re-keyed on insert, so running twice would duplicate every row.
    // Every insert-target table is checked (upsert-keyed tables are exempt).
    for (const table of [
      "customers",
      "checkups",
      "medicines",
      "services",
      "doctors",
      "checkup_templates",
      "order_items",
      "checkup_services",
    ]) {
      const count = await targetCount(table);
      if (count > 0) {
        die(
          `Target table bsk.${table} already has ${count} rows. This script expects an ` +
            "empty target (re-running duplicates data). Pass --allow-nonempty to override.",
        );
      }
    }
  }

  await migrateClinicSettings();
  const doctors = await migrateDoctors();
  const medicineMap = await migrateMedicines();
  const serviceMap = await migrateServices();
  await migrateTemplates();
  const customerMap = await migrateCustomers();
  const serviceNoteLines = collectServiceNoteLines();
  const { map: checkupMap, dateOf } = await migrateCheckups(customerMap, doctors, serviceNoteLines);
  await migrateOrderItems(checkupMap, medicineMap);
  await migrateCheckupServices(checkupMap, serviceMap);
  await migrateMedicineOrders(checkupMap, dateOf);
  await migrateQueueCounters();
  reportUpstreamUsers();

  if (warnings.length > 0) {
    log("");
    log(`${warnings.length} warning(s):`);
    const MAX = 50;
    for (const w of warnings.slice(0, MAX)) log(`  ! ${w}`);
    if (warnings.length > MAX) log(`  … and ${warnings.length - MAX} more`);
  }
  log("");
  log(
    dryRun
      ? "dry run complete — re-run without --dry-run to write."
      : "done. Post-migration: run `npm run db:seed-geo`, re-invite staff, review the " +
          "converted checkup templates, and backfill patient province/ward in the UI.",
  );
}

main()
  .catch((e) => die(e instanceof Error ? (e.stack ?? e.message) : String(e)))
  .finally(() => sqlite.close());
