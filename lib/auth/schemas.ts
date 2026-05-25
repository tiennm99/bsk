/**
 * BSK sign-in schema and shared state types.
 *
 * No `'use server'` here — this module is framework-agnostic so it can be
 * imported by both client code (RHF resolver) and server code (actions).
 *
 * Zod v4: z.string().email() | z.string().min(8).max(72)
 * 72 = bcrypt's effective byte limit, matching Supabase's default password cap.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const SignInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
});

export type SignInInput = z.infer<typeof SignInSchema>;

// ---------------------------------------------------------------------------
// Discriminated-union state — returned by signInAction, consumed by useActionState
//
// All variants must be JSON-serializable (no Error objects, no Date, no functions)
// so they can cross the RSC/client boundary without crashing serialization.
// ---------------------------------------------------------------------------

export type SignInState =
  | { status: "idle" }
  | {
      status: "error";
      /** Per-field validation errors keyed by field name. */
      fieldErrors: Record<string, string[]>;
      /** Non-field error (auth failure, server error). Null when fieldErrors are set. */
      formError: string | null;
    };

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Parses a raw FormData submission against `SignInSchema`.
 *
 * Returns `{ success: true, data }` on valid input, or
 * `{ success: false, fieldErrors }` on invalid input.
 *
 * Extracts entries via `Object.fromEntries` — safe because FormData entries
 * here are single-value strings (email + password).
 */
export function parseSignIn(
  formData: FormData,
):
  | { success: true; data: SignInInput }
  | { success: false; fieldErrors: Record<string, string[]> } {
  const result = SignInSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    // Zod v4: flatten() still produces { fieldErrors, formErrors }
    const flat = result.error.flatten();
    return { success: false, fieldErrors: flat.fieldErrors as Record<string, string[]> };
  }

  return { success: true, data: result.data };
}
