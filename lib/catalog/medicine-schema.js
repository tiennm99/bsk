/** Zod schema + state for medicines. Shared client/server. Money = integer VND. */

import { z } from "zod";

export const MedicineSchema = z.object({
  name: z.string().trim().min(1).max(200),
  unit: z.string().trim().max(50).default(""),
  salePrice: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
  costPrice: z.string().trim().max(15).default(""), // optional int text → null
  company: z.string().trim().max(200).default(""),
  route: z.string().trim().max(100).default(""),
});
/** @typedef {import("zod").infer<typeof MedicineSchema>} MedicineInput */

/**
 * @typedef {
 *   | { status: "idle" }
 *   | { status: "error"; fieldErrors: Record<string, string[]>; formError: string | null }
 * } MedicineFormState
 */
