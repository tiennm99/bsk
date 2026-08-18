/**
 * Pure value transforms for migrating an original BSK desktop install's
 * SQLite data (see scripts/migrate-from-upstream.mjs, which orchestrates the
 * actual migration). Kept dependency-free so tests/unit can exercise the
 * trickiest conversions (RTF templates, epoch-millis dates, enum labels)
 * without touching a database.
 *
 * Every mapping here was verified against the upstream Java source —
 * plans/reports/code-reviewer-260818-1749-migration-script-upstream-compat-
 * audit-report.md has the file:line evidence.
 */

/** @typedef {string | number | bigint | Uint8Array | null} SqlValue */

/** @type {(msg: string) => void} */
let onWarn = () => {};

/**
 * Registers the warning sink used by transforms that can drop data.
 * @param {(msg: string) => void} fn
 */
export function setOnWarn(fn) {
  onWarn = fn;
}

/**
 * Trimmed string or null.
 * @param {SqlValue | undefined} v
 * @returns {string | null}
 */
export function str(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/**
 * Integer VND from an upstream DOUBLE (rounded, clamped to >= 0 to satisfy the
 * target CHECK constraints).
 * @param {SqlValue | undefined} v
 * @returns {number}
 */
export function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

/**
 * @param {SqlValue | undefined} v
 * @returns {number | null}
 */
export function int(v) {
  if (v == null) return null; // Number(null) is 0, which must stay "unset"
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * @param {SqlValue | undefined} v
 * @returns {boolean}
 */
export function bool(v) {
  return v === 1 || v === 1n || v === "1" || v === "true";
}

const vnDayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Sanity window for epoch-millis dates: 1900-01-01 … 2100-01-01. Upstream
// writes Date.getTime() millis, which are NEGATIVE for pre-1970 birth dates
// (verified: upstream AddDialog parses dd/MM/yyyy and expects "-?\d+").
const MS_MIN = Date.UTC(1900, 0, 1);
const MS_MAX = Date.UTC(2100, 0, 1);

/**
 * Clinic-local (UTC+7) YYYY-MM-DD from an upstream date value: Java epoch
 * millis (possibly negative), an ISO string, or Vietnamese dd/MM/yyyy.
 * Exactly 0 is treated as "unset" (a real 1970-01-01 VN date is -25200000).
 * @param {SqlValue | undefined} v
 * @returns {string | null}
 */
export function vnDate(v) {
  if (v == null) return null;
  if (typeof v === "number" || typeof v === "bigint") {
    const ms = Number(v);
    if (!Number.isFinite(ms) || ms === 0) return null;
    if (ms < MS_MIN || ms > MS_MAX) {
      onWarn(`Date value ${ms} outside 1900–2100 → NULL`);
      return null;
    }
    return vnDayFmt.format(new Date(ms));
  }
  const s = String(v).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) {
    // Validate the calendar date — Postgres rejects e.g. 1985-02-31, which
    // would abort a live migration mid-run.
    const day = Number(dmy[1]);
    const mon = Number(dmy[2]);
    const year = Number(dmy[3]);
    const probe = new Date(Date.UTC(year, mon - 1, day));
    if (
      probe.getUTCFullYear() !== year ||
      probe.getUTCMonth() !== mon - 1 ||
      probe.getUTCDate() !== day
    ) {
      onWarn(`Invalid calendar date "${s}" → NULL`);
      return null;
    }
    return `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  if (/^-?\d{1,13}$/.test(s)) return vnDate(Number(s));
  return null;
}

/**
 * Normalizes an enum-ish label for dictionary lookup.
 * @param {SqlValue | undefined} v
 * @returns {string}
 */
export function norm(v) {
  return String(v ?? "")
    .normalize("NFC")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** @type {Record<string, "waiting" | "in_progress" | "done">} */
export const STATUS_MAP = {
  WAITING: "waiting",
  PENDING: "waiting",
  "CHỜ KHÁM": "waiting",
  "ĐANG CHỜ": "waiting",
  "CHƯA KHÁM": "waiting",
  IN_PROGRESS: "in_progress",
  "IN PROGRESS": "in_progress",
  PROCESSING: "in_progress",
  "ĐANG KHÁM": "in_progress",
  DONE: "done",
  COMPLETED: "done",
  FINISHED: "done",
  "ĐÃ KHÁM": "done",
  "HOÀN THÀNH": "done",
};

/** @type {Record<string, "male" | "female" | "other">} */
export const GENDER_MAP = {
  M: "male",
  MALE: "male",
  NAM: "male",
  F: "female",
  FEMALE: "female",
  NỮ: "female",
  NU: "female",
  OTHER: "other",
  KHÁC: "other",
};

// The upstream Java app only ever writes "Unpaid" (no paid path exists in its
// code) — this set is belt-and-braces for hand-edited databases.
export const PAID_LABELS = new Set(["PAID", "ĐÃ THANH TOÁN", "ĐÃ THU", "ĐÃ TRẢ", "ĐÃ TRẢ TIỀN"]);

// Upstream shifts: 0 = morning, 1 = afternoon (LocalStorage.currentShift).
// Target bsk.shifts: 1 = morning, 2 = afternoon, 3 = evening.
/** @type {Record<number, number>} */
export const SHIFT_MAP = { 0: 1, 1: 2 };

/**
 * Target shift_id for an upstream shift value, or null (with one warning per
 * distinct unknown value).
 * @param {SqlValue | undefined} v
 * @param {Set<number>} unknownSeen
 * @returns {number | null}
 */
export function mapShift(v, unknownSeen) {
  const s = int(v);
  if (s == null) return null;
  const mapped = SHIFT_MAP[s];
  if (mapped == null && !unknownSeen.has(s)) {
    unknownSeen.add(s);
    onWarn(`Unknown upstream shift value ${s} → NULL (expected 0=morning, 1=afternoon)`);
  }
  return mapped ?? null;
}

/**
 * Best-effort plain text from Swing RTFEditorKit output. Upstream stores
 * checkup-template `content` as RTF ({\rtf1...}); this decodes \uN?/\'hh
 * escapes, turns \par|\line into newlines, skips header destination groups
 * (fonttbl, colortbl, …), and drops all other control words. Legacy templates
 * saved before the RTF editor are plain text and pass through untouched.
 * @param {string} content
 * @returns {string}
 */
export function rtfToText(content) {
  if (!content.startsWith("{\\rtf")) return content;
  let out = "";
  let skipDepth = 0; // inside a destination group whose text is not content
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === "\\") {
      // Escaped literals bind tighter than group tracking: consume \\ \{ \}
      // even inside skipped groups so they can never corrupt depth counting.
      const next = content[i + 1];
      if (next === "\\" || next === "{" || next === "}") {
        if (skipDepth === 0) out += next;
        i++;
        continue;
      }
      if (skipDepth > 0) continue;
      const hex = content.slice(i, i + 4).match(/^\\'([0-9a-f]{2})/i);
      if (hex) {
        out += String.fromCharCode(parseInt(/** @type {string} */ (hex[1]), 16));
        i += 3;
        continue;
      }
      const word = content.slice(i).match(/^\\([a-z]+)(-?\d+)? ?/i);
      if (word) {
        if (word[1] === "par" || word[1] === "line") out += "\n";
        else if (word[1] === "u" && word[2]) {
          out += String.fromCharCode(((Number(word[2]) % 65536) + 65536) % 65536);
          // \uN is followed by a one-character ANSI fallback to skip.
          i += word[0].length;
          continue;
        }
        i += word[0].length - 1;
        continue;
      }
      continue;
    }
    if (ch === "{") {
      if (skipDepth > 0) skipDepth++;
      else if (/^\\(?:\*|fonttbl|colortbl|stylesheet|info|pict)/.test(content.slice(i + 1, i + 12)))
        skipDepth = 1;
      continue;
    }
    if (ch === "}") {
      if (skipDepth > 0) skipDepth--;
      continue;
    }
    if (skipDepth > 0) continue;
    if (ch !== "\r" && ch !== "\n") out += ch; // raw newlines are not RTF content
  }
  return out;
}
