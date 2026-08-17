/**
 * Zod schema + state for clinic settings. Shared client (RHF) / server (action).
 * All fields optional — a new clinic starts blank and fills these in.
 */

import { z } from "zod";

export const ClinicSettingsSchema = z.object({
  name: z.string().trim().max(200),
  address: z.string().trim().max(300),
  phone: z.string().trim().max(30),
  prefix: z.string().trim().max(20),
});

export type ClinicSettingsInput = z.infer<typeof ClinicSettingsSchema>;

export type ClinicSettingsState =
  | { status: "idle" }
  | { status: "error"; fieldErrors: Record<string, string[]>; formError: string | null }
  | { status: "success" };
