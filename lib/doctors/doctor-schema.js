/**
 * Zod schema + state types for doctor management.
 *
 * No `'use server'` — shared between the Server Action (validation) and the
 * Client Component (RHF resolver), same split as lib/auth/invite-schema.ts.
 */

import { z } from "zod";

export const DoctorSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
});

/** @typedef {import("zod").infer<typeof DoctorSchema>} DoctorInput */

/**
 * useActionState shape for the add-doctor form. JSON-serializable.
 * @typedef {
 *   | { status: "idle" }
 *   | { status: "error"; fieldErrors: Record<string, string[]>; formError: string | null }
 *   | { status: "success"; doctorName: string }
 * } DoctorFormState
 */
