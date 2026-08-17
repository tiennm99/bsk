/** Zod schema + state for services. Shared client/server. Money = integer VND. */

import { z } from "zod";

export const ServiceSchema = z.object({
  name: z.string().trim().min(1).max(200),
  price: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
});
export type ServiceInput = z.infer<typeof ServiceSchema>;

export type ServiceFormState =
  | { status: "idle" }
  | { status: "error"; fieldErrors: Record<string, string[]>; formError: string | null }
  | { status: "success"; serviceName: string };
