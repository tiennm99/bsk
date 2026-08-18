/**
 * BSK role constants and type utilities.
 *
 * `appRoles` is the single source of truth for the ordered list of role values.
 * `AppRole` is derived from it so the union never drifts from the tuple.
 * The `satisfies` guard at the bottom catches any drift between this file and
 * the generated database types at typecheck time — no runtime cost.
 */

// Ordered tuple — used for iteration (dropdowns, role-badge maps, etc.)
export const appRoles = /** @type {const} */ ([
  "admin",
  "doctor",
  "nurse",
  "receptionist",
  "cashier",
  "patient",
]);

/** Union of all valid BSK role strings, derived from the tuple above. @typedef {(typeof appRoles)[number]} AppRole */

/**
 * Compile-time guard: if the database enum and this tuple ever diverge,
 * typecheck fails here — not at a runtime crash in production.
 * @type {import("@/types/supabase-bsk").Database["bsk"]["Enums"]["app_role"][]}
 */
const _roleGuard = [...appRoles];
void _roleGuard; // prevent unused-variable lint warning

/**
 * Roles allowed to see clinical data (diagnoses, vitals, imaging, printed
 * medical reports). Shared by layouts AND route handlers so the PDF endpoints
 * can never drift broader than the screens that link to them.
 * @type {readonly AppRole[]}
 */
export const clinicalRoles = /** @type {const} */ (["admin", "receptionist", "doctor", "nurse"]);

/**
 * Roles allowed to render billing documents (invoice PDF): every staff role.
 * The `patient` role is excluded — invoices carry other patients' ids/names.
 * @type {readonly AppRole[]}
 */
export const billingRoles = /** @type {const} */ ([
  "admin",
  "receptionist",
  "doctor",
  "nurse",
  "cashier",
]);

/**
 * Returns true if `s` is a valid `AppRole` value.
 * Use as a type-narrowing guard when validating external input.
 *
 * @param {string} s
 * @returns {s is AppRole}
 */
export function isAppRole(s) {
  return /** @type {readonly string[]} */ (appRoles).includes(s);
}
