/**
 * Zod schemas + state for the prescription/service composer and payment.
 * Shared client/server. Money = integer VND — line totals here are a UX
 * preview only; bsk.save_prescription()/save_checkup_services() recompute
 * unit_price/line_total server-side from the catalogs (authoritative).
 */

import { z } from "zod";

// ── Composer lines (client-managed rows, serialized to JSON on submit) ──────
export const MedicineLineSchema = z.object({
  medicineId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().positive().max(10_000),
  dosage: z.string().trim().max(200).default(""),
  notes: z.string().trim().max(500).default(""),
});
/** @typedef {import("zod").infer<typeof MedicineLineSchema>} MedicineLine */

export const ServiceLineSchema = z.object({
  serviceId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().positive().max(10_000),
});
/** @typedef {import("zod").infer<typeof ServiceLineSchema>} ServiceLine */

export const MedicineLinesSchema = z.array(MedicineLineSchema).max(200);
export const ServiceLinesSchema = z.array(ServiceLineSchema).max(200);

/** @typedef {{ status: "idle" } | { status: "error"; formError: string }} PrescriptionSaveState */

// ── Payment (admin/cashier) ──────────────────────────────────────────────────
/** @type {readonly ["cash", "card", "transfer"]} */
export const paymentMethods = ["cash", "card", "transfer"];
/** @typedef {(typeof paymentMethods)[number]} PaymentMethod */

export const MarkPaidSchema = z.object({
  method: z.enum(paymentMethods),
});

/**
 * @typedef {
 *   | { status: "idle" }
 *   | { status: "error"; formError: string }
 *   | { status: "success" }
 * } MarkPaidState
 */
