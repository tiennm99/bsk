/**
 * Zod schema and state types for the admin invite flow.
 *
 * No `'use server'` — framework-agnostic so it can be imported by both the
 * Server Action (validation) and the Client Component (RHF resolver).
 */

import { z } from "zod";
import { appRoles } from "@/lib/db/roles";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const InviteUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(appRoles),
});

/** @typedef {import("zod").infer<typeof InviteUserSchema>} InviteUserInput */

// ---------------------------------------------------------------------------
// Discriminated-union state — returned by inviteUserAction, consumed by
// useActionState. All variants must be JSON-serializable.
// ---------------------------------------------------------------------------

/**
 * @typedef {object} InviteUserErrorState
 * @property {"error"} status
 * @property {Record<string, string[]>} fieldErrors Per-field validation errors keyed by field name.
 * @property {string | null} formError Non-field error (forbidden, email taken, server error). Null when fieldErrors are set.
 */

/**
 * @typedef {object} InviteUserSuccessState
 * @property {"success"} status
 * @property {string} invitedEmail The email address of the newly invited user.
 */

/**
 * @typedef {{ status: "idle" } | InviteUserErrorState | InviteUserSuccessState} InviteUserState
 */
