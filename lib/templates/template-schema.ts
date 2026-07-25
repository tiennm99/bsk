/**
 * Zod schema + state for checkup templates. Shared client/server.
 * `fieldsText` is one field label per line in the UI; the action serializes it
 * to the jsonb [{ label }] layout.
 */

import { z } from "zod";

export const templateGenders = ["any", "male", "female", "other"] as const;
export type TemplateGender = (typeof templateGenders)[number];

export const TemplateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  title: z.string().trim().max(200).default(""),
  gender: z.enum(templateGenders).default("any"),
  photoNum: z.coerce.number().int().min(0).max(50).default(0),
  fieldsText: z.string().max(5000).default(""),
});

export type TemplateInput = z.infer<typeof TemplateSchema>;

export type TemplateFormState =
  | { status: "idle" }
  | { status: "error"; fieldErrors: Record<string, string[]>; formError: string | null };

/** Split the textarea into an ordered [{ label }] layout (blank lines dropped). */
export function fieldsTextToJson(text: string): { label: string }[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((label) => ({ label }));
}

/** Inverse: render a stored layout back to one-label-per-line text for editing. */
export function fieldsJsonToText(fields: unknown): string {
  return fieldsJsonToLabels(fields).join("\n");
}

/** Extract just the ordered labels from a stored `fields` layout. */
export function fieldsJsonToLabels(fields: unknown): string[] {
  if (!Array.isArray(fields)) return [];
  return fields
    .map((f) => (f && typeof f === "object" && "label" in f ? String((f as { label: unknown }).label) : ""))
    .filter(Boolean);
}
