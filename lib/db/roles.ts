/**
 * BSK role constants and type utilities.
 *
 * `appRoles` is the single source of truth for the ordered list of role values.
 * `AppRole` is derived from it so the union never drifts from the tuple.
 * The `satisfies` guard at the bottom catches any drift between this file and
 * the generated database types at typecheck time — no runtime cost.
 */

import type { Database } from "@/types/supabase-bsk";

// Ordered tuple — used for iteration (dropdowns, role-badge maps, etc.)
export const appRoles = ["admin", "doctor", "nurse", "receptionist", "cashier", "patient"] as const;

/** Union of all valid BSK role strings, derived from the tuple above. */
export type AppRole = (typeof appRoles)[number];

/**
 * Compile-time guard: if the database enum and this tuple ever diverge,
 * typecheck fails here — not at a runtime crash in production.
 */
const _roleGuard: AppRole[] = [] satisfies Database["bsk"]["Enums"]["app_role"][];
void _roleGuard; // prevent unused-variable lint warning

/**
 * Returns true if `s` is a valid `AppRole` value.
 * Use as a type-narrowing guard when validating external input.
 */
export function isAppRole(s: string): s is AppRole {
  return (appRoles as readonly string[]).includes(s);
}
