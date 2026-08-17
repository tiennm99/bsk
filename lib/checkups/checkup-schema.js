/**
 * Zod schemas + state for the queue/checkup workflow. Shared client/server.
 */

import { z } from "zod";

export const checkupStatuses = ["waiting", "in_progress", "done"] as const;
export type CheckupStatus = (typeof checkupStatuses)[number];

// ── Register a patient into today's queue ────────────────────────────────────
export const RegisterCheckupSchema = z.object({
  customerId: z.coerce.number().int().positive(),
  shiftId: z.coerce.number().int().min(1),
  doctorId: z.string().trim().default(""), // "" or a numeric id
  checkupType: z.string().trim().max(100).default(""),
});
export type RegisterCheckupInput = z.infer<typeof RegisterCheckupSchema>;

export type RegisterCheckupState =
  | { status: "idle" }
  | { status: "error"; fieldErrors: Record<string, string[]>; formError: string | null }
  | { status: "success"; queueNumber: number | null };

// ── Manual queue-counter override (admin/receptionist) ───────────────────────
export const SetQueueCounterSchema = z.object({
  shiftId: z.coerce.number().int().min(1),
  value: z.coerce.number().int().min(0),
});
export type SetQueueCounterInput = z.infer<typeof SetQueueCounterSchema>;

export type SetQueueCounterState =
  { status: "idle" } | { status: "error"; formError: string | null } | { status: "success" };

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
export type CheckupSaveInput = z.infer<typeof CheckupSaveSchema>;

export type CheckupSaveState =
  | { status: "idle" }
  | { status: "error"; fieldErrors: Record<string, string[]>; formError: string | null };

/** Text numeric field → number | null (blank/NaN → null). */
export function parseNum(s: string): number | null {
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
export type TemplateValues = z.infer<typeof TemplateValuesSchema>;

/**
 * Parses the `templateValues` hidden-input JSON string. Invalid JSON or a
 * shape that fails validation is treated as "no template values" (null)
 * rather than failing the whole checkup save.
 */
export function parseTemplateValues(raw: string): TemplateValues | null {
  if (!raw.trim()) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = TemplateValuesSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}
