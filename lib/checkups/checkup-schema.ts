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
