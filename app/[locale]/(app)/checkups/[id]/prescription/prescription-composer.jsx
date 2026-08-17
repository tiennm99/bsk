"use client";

/**
 * Prescription + service composer. Dynamic medicine/service rows (add/remove)
 * with a live grand-total preview (unit prices from the catalogs passed down
 * as props). "Save" posts both line arrays (serialized to JSON in hidden
 * inputs) to savePrescriptionAction, which calls the save_prescription /
 * save_checkup_services RPCs — those recompute unit_price/line_total
 * server-side, so the total shown here is a preview only, never trusted.
 *
 * Also renders the payment status and, for admin/cashier, a "Mark paid" form.
 */

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dosePresets } from "@/lib/billing/dose-presets";
import { paymentMethods } from "@/lib/billing/prescription-schema";
import { markPaidAction, savePrescriptionAction } from "./actions";

/** @typedef {import('@/lib/billing/prescription-schema').MarkPaidState} MarkPaidState */
/** @typedef {import('@/lib/billing/prescription-schema').PrescriptionSaveState} PrescriptionSaveState */

const DOSE_PRESETS_LIST_ID = "dose-presets";

/** @param {number} n */
const vnd = (n) => `${new Intl.NumberFormat("vi-VN").format(n)} ₫`;

const SELECT =
  "border-input bg-background text-foreground focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus:outline-none focus-visible:ring-2 disabled:opacity-50";

/** @typedef {{ id: number, name: string, unit: string | null, sale_price: number }} Medicine */
/** @typedef {{ id: number, name: string, price: number }} Service */

/**
 * @typedef {object} MedicineRow
 * @property {string} key
 * @property {number} medicineId
 * @property {number} quantity
 * @property {string} dosage
 * @property {string} notes
 */
/** @typedef {{ key: string, serviceId: number, quantity: number }} ServiceRow */

/**
 * @typedef {object} Payment
 * @property {"unpaid" | "paid"} status
 * @property {string | null} method
 * @property {string | null} paidAt
 */

/**
 * @param {{
 *   checkupId: number,
 *   medicines: Medicine[],
 *   services: Service[],
 *   initialMedicineLines: { medicineId: number, quantity: number, dosage: string, notes: string }[],
 *   initialServiceLines: { serviceId: number, quantity: number }[],
 *   payment: Payment,
 *   canMarkPaid: boolean,
 * }} props
 */
export function PrescriptionComposer({
  checkupId,
  medicines,
  services,
  initialMedicineLines,
  initialServiceLines,
  payment,
  canMarkPaid,
}) {
  const t = useTranslations("billing");

  const [medicineRows, setMedicineRows] = useState(
    /** @type {MedicineRow[]} */ (
      initialMedicineLines.map((l, i) => ({ ...l, key: `m-init-${i}` }))
    ),
  );
  const [serviceRows, setServiceRows] = useState(
    /** @type {ServiceRow[]} */ (initialServiceLines.map((l, i) => ({ ...l, key: `s-init-${i}` }))),
  );

  const [saveState, saveDispatch, isSaving] = useActionState(savePrescriptionAction, {
    status: "idle",
  });
  const [payState, payDispatch, isPaying] = useActionState(markPaidAction, {
    status: "idle",
  });

  const medMap = new Map(medicines.map((m) => [m.id, m.sale_price]));
  const svcMap = new Map(services.map((s) => [s.id, s.price]));

  const addMedicineRow = () =>
    setMedicineRows((rows) => [
      ...rows,
      {
        key: `m-${crypto.randomUUID()}`,
        medicineId: medicines[0]?.id ?? 0,
        quantity: 1,
        dosage: "",
        notes: "",
      },
    ]);
  /** @param {string} key */
  const removeMedicineRow = (key) => setMedicineRows((rows) => rows.filter((r) => r.key !== key));
  /**
   * @template {keyof MedicineRow} K
   * @param {string} key
   * @param {K} field
   * @param {MedicineRow[K]} value
   */
  const updateMedicineRow = (key, field, value) =>
    setMedicineRows((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)));

  const addServiceRow = () =>
    setServiceRows((rows) => [
      ...rows,
      { key: `s-${crypto.randomUUID()}`, serviceId: services[0]?.id ?? 0, quantity: 1 },
    ]);
  /** @param {string} key */
  const removeServiceRow = (key) => setServiceRows((rows) => rows.filter((r) => r.key !== key));
  /**
   * @template {keyof ServiceRow} K
   * @param {string} key
   * @param {K} field
   * @param {ServiceRow[K]} value
   */
  const updateServiceRow = (key, field, value) =>
    setServiceRows((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)));

  const medicineTotal = medicineRows.reduce(
    (sum, r) => sum + (medMap.get(r.medicineId) ?? 0) * (r.quantity || 0),
    0,
  );
  const serviceTotal = serviceRows.reduce(
    (sum, r) => sum + (svcMap.get(r.serviceId) ?? 0) * (r.quantity || 0),
    0,
  );
  const grandTotal = medicineTotal + serviceTotal;

  const medicineLinesJson = JSON.stringify(
    medicineRows.map((r) => ({
      medicineId: r.medicineId,
      quantity: r.quantity,
      dosage: r.dosage,
      notes: r.notes,
    })),
  );
  const serviceLinesJson = JSON.stringify(
    serviceRows.map((r) => ({ serviceId: r.serviceId, quantity: r.quantity })),
  );

  const saveError = saveState.status === "error" ? saveState.formError : null;
  const payError = payState.status === "error" ? payState.formError : null;

  return (
    <div className="space-y-8">
      <datalist id={DOSE_PRESETS_LIST_ID}>
        {dosePresets.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>

      <form action={saveDispatch} noValidate className="space-y-6">
        <input type="hidden" name="checkupId" value={checkupId} readOnly />
        <input type="hidden" name="medicineLines" value={medicineLinesJson} readOnly />
        <input type="hidden" name="serviceLines" value={serviceLinesJson} readOnly />

        <fieldset className="border-border space-y-3 rounded-md border p-4">
          <legend className="text-muted-foreground px-1 text-xs">{t("medicines")}</legend>

          {medicineRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noLines")}</p>
          ) : (
            medicineRows.map((row) => (
              <div
                key={row.key}
                className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_1fr_2fr_auto] sm:items-end"
              >
                <div className="space-y-1.5">
                  <Label htmlFor={`medicine-${row.key}`}>{t("medicine")}</Label>
                  <select
                    id={`medicine-${row.key}`}
                    value={row.medicineId}
                    disabled={isSaving}
                    onChange={(e) =>
                      updateMedicineRow(row.key, "medicineId", Number(e.target.value))
                    }
                    className={SELECT}
                  >
                    {medicines.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({vnd(m.sale_price)})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`quantity-${row.key}`}>{t("quantity")}</Label>
                  <Input
                    id={`quantity-${row.key}`}
                    type="number"
                    min={1}
                    value={row.quantity}
                    disabled={isSaving}
                    onChange={(e) =>
                      updateMedicineRow(
                        row.key,
                        "quantity",
                        Math.max(1, Number(e.target.value) || 1),
                      )
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`dosage-${row.key}`}>{t("dosage")}</Label>
                  <Input
                    id={`dosage-${row.key}`}
                    value={row.dosage}
                    disabled={isSaving}
                    list={DOSE_PRESETS_LIST_ID}
                    onChange={(e) => updateMedicineRow(row.key, "dosage", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`notes-${row.key}`}>{t("notes")}</Label>
                  <Input
                    id={`notes-${row.key}`}
                    value={row.notes}
                    disabled={isSaving}
                    onChange={(e) => updateMedicineRow(row.key, "notes", e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive"
                  disabled={isSaving}
                  onClick={() => removeMedicineRow(row.key)}
                >
                  {t("remove")}
                </Button>
              </div>
            ))
          )}

          <Button
            type="button"
            variant="outline"
            disabled={isSaving || medicines.length === 0}
            onClick={addMedicineRow}
          >
            {t("addRow")}
          </Button>
          <p className="text-muted-foreground text-sm">
            {t("subtotal", { amount: vnd(medicineTotal) })}
          </p>
        </fieldset>

        <fieldset className="border-border space-y-3 rounded-md border p-4">
          <legend className="text-muted-foreground px-1 text-xs">{t("services")}</legend>

          {serviceRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noLines")}</p>
          ) : (
            serviceRows.map((row) => (
              <div
                key={row.key}
                className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_auto] sm:items-end"
              >
                <div className="space-y-1.5">
                  <Label htmlFor={`service-${row.key}`}>{t("service")}</Label>
                  <select
                    id={`service-${row.key}`}
                    value={row.serviceId}
                    disabled={isSaving}
                    onChange={(e) => updateServiceRow(row.key, "serviceId", Number(e.target.value))}
                    className={SELECT}
                  >
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({vnd(s.price)})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`service-quantity-${row.key}`}>{t("quantity")}</Label>
                  <Input
                    id={`service-quantity-${row.key}`}
                    type="number"
                    min={1}
                    value={row.quantity}
                    disabled={isSaving}
                    onChange={(e) =>
                      updateServiceRow(
                        row.key,
                        "quantity",
                        Math.max(1, Number(e.target.value) || 1),
                      )
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive"
                  disabled={isSaving}
                  onClick={() => removeServiceRow(row.key)}
                >
                  {t("remove")}
                </Button>
              </div>
            ))
          )}

          <Button
            type="button"
            variant="outline"
            disabled={isSaving || services.length === 0}
            onClick={addServiceRow}
          >
            {t("addRow")}
          </Button>
          <p className="text-muted-foreground text-sm">
            {t("subtotal", { amount: vnd(serviceTotal) })}
          </p>
        </fieldset>

        <div className="flex items-center justify-between gap-4">
          <p className="text-foreground text-lg font-semibold">
            {t("total", { amount: vnd(grandTotal) })}
          </p>
          <Button type="submit" size="lg" disabled={isSaving}>
            {isSaving ? t("saving") : t("save")}
          </Button>
        </div>

        {saveError && (
          <p className="text-destructive text-sm" role="alert">
            {saveError}
          </p>
        )}
      </form>

      <section className="border-border rounded-md border p-4">
        <h2 className="text-foreground mb-3 text-sm font-medium">{t("payment")}</h2>
        <p className="mb-3 text-sm">
          <span
            className={
              payment.status === "paid"
                ? "rounded bg-green-100 px-2 py-0.5 font-medium text-green-800 dark:bg-green-950 dark:text-green-200"
                : "bg-muted text-foreground rounded px-2 py-0.5 font-medium"
            }
          >
            {t(payment.status)}
          </span>
          {payment.method ? ` · ${t(`method.${payment.method}`)}` : ""}
        </p>

        {canMarkPaid && payment.status !== "paid" && (
          <form action={payDispatch} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="checkupId" value={checkupId} readOnly />
            <div className="space-y-1.5">
              <Label htmlFor="method">{t("method.label")}</Label>
              <select
                id="method"
                name="method"
                disabled={isPaying}
                defaultValue={paymentMethods[0]}
                className={SELECT}
              >
                {paymentMethods.map((m) => (
                  <option key={m} value={m}>
                    {t(`method.${m}`)}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={isPaying}>
              {isPaying ? t("saving") : t("markPaid")}
            </Button>
            {payError && (
              <p className="text-destructive w-full text-sm" role="alert">
                {payError}
              </p>
            )}
          </form>
        )}
      </section>
    </div>
  );
}
