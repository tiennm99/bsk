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

export type InviteUserInput = z.infer<typeof InviteUserSchema>;

// ---------------------------------------------------------------------------
// Discriminated-union state — returned by inviteUserAction, consumed by
// useActionState. All variants must be JSON-serializable.
// ---------------------------------------------------------------------------

export type InviteUserState =
  | { status: "idle" }
  | {
      status: "error";
      /** Per-field validation errors keyed by field name. */
      fieldErrors: Record<string, string[]>;
      /** Non-field error (forbidden, email taken, server error). Null when fieldErrors are set. */
      formError: string | null;
    }
  | {
      status: "success";
      /** The email address of the newly invited user. */
      invitedEmail: string;
    };
