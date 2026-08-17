/**
 * Zod schema + state for patient (customer) forms. Shared client/server.
 * Only names are required; everything else is optional and stored NULL when blank.
 */

import { z } from "zod";

export const genderValues = ["male", "female", "other"];
/** @typedef {(typeof genderValues)[number]} Gender */

export const CustomerSchema = z.object({
  lastName: z.string().trim().min(1).max(100),
  firstName: z.string().trim().min(1).max(100),
  dob: z
    .string()
    .trim()
    .max(10)
    .refine((v) => v === "" || !Number.isNaN(Date.parse(v)), "invalid date")
    .default(""),
  gender: z.enum(["", "male", "female", "other"]).default(""),
  phone: z.string().trim().max(20).default(""),
  cccd: z.string().trim().max(20).default(""),
  provinceCode: z.string().trim().max(20).default(""),
  wardCode: z.string().trim().max(20).default(""),
  addressDetail: z.string().trim().max(300).default(""),
});

/** @typedef {import("zod").infer<typeof CustomerSchema>} CustomerInput */

/**
 * Error-or-idle state; success redirects to the list, so there's no success variant.
 * @typedef {
 *   | { status: "idle" }
 *   | { status: "error"; fieldErrors: Record<string, string[]>; formError: string | null }
 * } CustomerFormState
 */
