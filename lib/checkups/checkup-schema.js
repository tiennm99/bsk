/**
 * Zod schemas + state for the queue/checkup workflow. Shared client/server.
 */

import { z } from "zod";

export const checkupStatuses = ["waiting", "in_progress", "done"];
/** @typedef {(typeof checkupStatuses)[number]} CheckupStatus */

// ── Register a patient into today's queue ────────────────────────────────────
export const RegisterCheckupSchema = z.object({
  customerId: z.coerce.number().int().positive(),
  shiftId: z.coerce.number().int().min(1),
  doctorId: z.string().trim().default(""), // "" or a numeric id
  checkupType: z.string().trim().max(100).default(""),
});
/** @typedef {import("zod").infer<typeof RegisterCheckupSchema>} RegisterCheckupInput */

/**
 * @typedef {
 *   | { status: "idle" }
 *   | { status: "error"; fieldErrors: Record<string, string[]>; formError: string | null }
 *   | { status: "success"; queueNumber: number | null }
 * } RegisterCheckupState
 */

// ── Manual queue-counter override (admin/receptionist) ───────────────────────
export const SetQueueCounterSchema = z.object({
  shiftId: z.coerce.number().int().min(1),
  value: z.coerce.number().int().min(0),
});
/** @typedef {import("zod").infer<typeof SetQueueCounterSchema>} SetQueueCounterInput */

/**
 * @typedef {
 *   | { status: "idle" }
 *   | { status: "error"; formError: string | null }
 *   | { status: "success" }
 * } SetQueueCounterState
 */

// ── Doctor fills the checkup ─────────────────────────────────────────────────
const dateOrEmpty = z
  .string()
  .trim()
  .max(10)
  .refine((v) => v === "" || !Number.isNaN(Date.parse(v)), "invalid date")
  .default("");

export const CheckupSaveSchema = z.object({
  heartBeat: z.string().trim().max(20).default(""),
  bloodPressure: z.string().trim().max(20).default(""),
  temperature: z.string().trim().max(10).default(""),
  weight: z.string().trim().max(10).default(""),
  height: z.string().trim().max(10).default(""),
  symptoms: z.string().trim().max(2000).default(""),
  diagnosis: z.string().trim().max(2000).default(""),
  conclusion: z.string().trim().max(2000).default(""),
  notes: z.string().trim().max(2000).default(""),
  recheckDate: dateOrEmpty,
  status: z.enum(checkupStatuses).default("in_progress"),
});
/** @typedef {import("zod").infer<typeof CheckupSaveSchema>} CheckupSaveInput */

/**
 * @typedef {
 *   | { status: "idle" }
 *   | { status: "error"; fieldErrors: Record<string, string[]>; formError: string | null }
 * } CheckupSaveState
 */

/**
 * Text numeric field → number | null (blank/NaN → null).
 *
 * @param {string} s
 * @returns {number | null}
 */
export function parseNum(s) {
  const v = s.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ── Applied checkup-template field values ────────────────────────────────────
// Ordered [{ label, value }] snapshot of the template chosen on the checkup
// form, serialized to a single hidden `templateValues` JSON input (same trick
// as the prescription composer's line arrays).
export const TemplateValuesSchema = z
  .array(
    z.object({
      label: z.string().trim().min(1).max(500),
      value: z.string().max(500),
    }),
  )
  .max(50);
/** @typedef {import("zod").infer<typeof TemplateValuesSchema>} TemplateValues */

/**
 * Parses the `templateValues` hidden-input JSON string. Invalid JSON or a
 * shape that fails validation is treated as "no template values" (null)
 * rather than failing the whole checkup save.
 *
 * @param {string} raw
 * @returns {TemplateValues | null}
 */
export function parseTemplateValues(raw) {
  if (!raw.trim()) return null;
  /** @type {unknown} */
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = TemplateValuesSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}
