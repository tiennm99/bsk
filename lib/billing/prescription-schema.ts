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
export type MedicineLine = z.infer<typeof MedicineLineSchema>;

export const ServiceLineSchema = z.object({
  serviceId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().positive().max(10_000),
});
export type ServiceLine = z.infer<typeof ServiceLineSchema>;

export const MedicineLinesSchema = z.array(MedicineLineSchema).max(200);
export const ServiceLinesSchema = z.array(ServiceLineSchema).max(200);

export type PrescriptionSaveState = { status: "idle" } | { status: "error"; formError: string };

// ── Payment (admin/cashier) ──────────────────────────────────────────────────
export const paymentMethods = ["cash", "card", "transfer"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const MarkPaidSchema = z.object({
  method: z.enum(paymentMethods),
});

export type MarkPaidState =
  | { status: "idle" }
  | { status: "error"; formError: string }
  | { status: "success" };
