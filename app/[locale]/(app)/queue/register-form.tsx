"use client";

/**
 * Register-to-queue form. Picks a patient + shift (+ optional doctor/type) and
 * calls registerCheckupAction, which assigns the next queue number atomically.
 * On success it shows the assigned number and resets.
 */

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RegisterCheckupState } from "@/lib/checkups/checkup-schema";
import { registerCheckupAction } from "./actions";

type Patient = { id: number; last_name: string; first_name: string };
type Shift = { id: number; code: string };
type Doctor = { id: number; last_name: string; first_name: string };

const SELECT =
  "border-input bg-background text-foreground focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus:outline-none focus-visible:ring-2 disabled:opacity-50";

export function RegisterForm({
  patients,
  shifts,
  doctors,
}: {
  patients: Patient[];
  shifts: Shift[];
  doctors: Doctor[];
}) {
  const t = useTranslations("queue");
  const tShift = useTranslations("shifts");
  const formRef = useRef<HTMLFormElement>(null);

  const [state, dispatch, isPending] = useActionState<RegisterCheckupState, FormData>(
    registerCheckupAction,
    { status: "idle" },
  );

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  const fe = state.status === "error" ? state.fieldErrors : {};
  const formError = state.status === "error" ? state.formError : null;

  return (
    <form ref={formRef} action={dispatch} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="customerId">{t("patient")}</Label>
          <select id="customerId" name="customerId" required disabled={isPending} className={SELECT}>
            <option value="">—</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.last_name} {p.first_name}
              </option>
            ))}
          </select>
          {fe.customerId?.length ? (
            <p className="text-destructive text-sm" role="alert">
              {fe.customerId[0]}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="shiftId">{t("shift")}</Label>
          <select id="shiftId" name="shiftId" required disabled={isPending} className={SELECT}>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {tShift(s.code)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="doctorId">{t("doctor")}</Label>
          <select id="doctorId" name="doctorId" disabled={isPending} className={SELECT}>
            <option value="">—</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.last_name} {d.first_name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="checkupType">{t("type")}</Label>
          <Input id="checkupType" name="checkupType" disabled={isPending} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending ? t("registering") : t("register")}
        </Button>
        {state.status === "success" && (
          <p className="text-sm font-medium text-green-600" role="status">
            {t("registered", { number: state.queueNumber ?? "—" })}
          </p>
        )}
        {formError && (
          <p className="text-destructive text-sm" role="alert">
            {formError}
          </p>
        )}
      </div>
    </form>
  );
}
