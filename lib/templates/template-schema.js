/**
 * Zod schema + state for checkup templates. Shared client/server.
 * `fieldsText` is one field label per line in the UI; the action serializes it
 * to the jsonb [{ label }] layout.
 */

import { z } from "zod";

export const templateGenders = ["any", "male", "female", "other"];
/** @typedef {(typeof templateGenders)[number]} TemplateGender */

export const TemplateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  title: z.string().trim().max(200).default(""),
  gender: z.enum(templateGenders).default("any"),
  photoNum: z.coerce.number().int().min(0).max(50).default(0),
  fieldsText: z.string().max(5000).default(""),
});

/** @typedef {import("zod").infer<typeof TemplateSchema>} TemplateInput */

/**
 * @typedef {
 *   | { status: "idle" }
 *   | { status: "error"; fieldErrors: Record<string, string[]>; formError: string | null }
 * } TemplateFormState
 */

/**
 * Split the textarea into an ordered [{ label }] layout (blank lines dropped).
 * @param {string} text
 * @returns {{ label: string }[]}
 */
export function fieldsTextToJson(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((label) => ({ label }));
}

/**
 * Inverse: render a stored layout back to one-label-per-line text for editing.
 * @param {unknown} fields
 * @returns {string}
 */
export function fieldsJsonToText(fields) {
  return fieldsJsonToLabels(fields).join("\n");
}

/**
 * Extract just the ordered labels from a stored `fields` layout.
 * @param {unknown} fields
 * @returns {string[]}
 */
export function fieldsJsonToLabels(fields) {
  if (!Array.isArray(fields)) return [];
  return fields
    .map((f) =>
      f && typeof f === "object" && "label" in f
        ? String(/** @type {{ label: unknown }} */ (f).label)
        : "",
    )
    .filter(Boolean);
}
