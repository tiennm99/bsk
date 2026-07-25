"use client";

/**
 * Patient form — shared by create + edit. Native <form action> posting FormData
 * to the given Server Action (createCustomerAction / updateCustomerAction, both
 * useActionState-shaped). Province → ward is a cascading dropdown backed by
 * getWardsAction. Success redirects (handled in the action), so no success UI.
 */

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getWardsAction } from "./actions";
import type { CustomerFormState } from "@/lib/customers/customer-schema";

type Option = { code: string; name: string };

export type PatientDefaults = {
  id?: number;
  lastName: string;
  firstName: string;
  dob: string;
  gender: string;
  phone: string;
  cccd: string;
  provinceCode: string;
  wardCode: string;
  addressDetail: string;
};

const SELECT_CLASS =
  "border-input bg-background text-foreground focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus:outline-none focus-visible:ring-2 disabled:opacity-50";

export function PatientForm({
  mode,
  action,
  provinces,
  initialWards,
  defaults,
}: {
  mode: "create" | "edit";
  action: (prev: CustomerFormState, formData: FormData) => Promise<CustomerFormState>;
  provinces: Option[];
  initialWards: Option[];
  defaults: PatientDefaults;
}) {
  const t = useTranslations("patients");
  const [state, dispatch, isPending] = useActionState<CustomerFormState, FormData>(action, {
    status: "idle",
  });

  const [province, setProvince] = useState(defaults.provinceCode);
  const [ward, setWard] = useState(defaults.wardCode);
  const [wards, setWards] = useState<Option[]>(initialWards);
  const [loadingWards, startWards] = useTransition();

  function onProvinceChange(code: string) {
    setProvince(code);
    setWard("");
    startWards(async () => setWards(await getWardsAction(code)));
  }

  const fe = state.status === "error" ? state.fieldErrors : {};
  const formError = state.status === "error" ? state.formError : null;

  const err = (field: string) =>
    fe[field]?.length ? (
      <p className="text-destructive text-sm" role="alert">
        {fe[field][0]}
      </p>
    ) : null;

  return (
    <form action={dispatch} noValidate className="space-y-4">
      {mode === "edit" && <input type="hidden" name="id" value={defaults.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="lastName">{t("lastName")}</Label>
          <Input id="lastName" name="lastName" defaultValue={defaults.lastName} disabled={isPending} />
          {err("lastName")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="firstName">{t("firstName")}</Label>
          <Input id="firstName" name="firstName" defaultValue={defaults.firstName} disabled={isPending} />
          {err("firstName")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dob">{t("dob")}</Label>
          <Input id="dob" name="dob" type="date" defaultValue={defaults.dob} disabled={isPending} />
          {err("dob")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gender">{t("gender.label")}</Label>
          <select id="gender" name="gender" defaultValue={defaults.gender} disabled={isPending} className={SELECT_CLASS}>
            <option value="">—</option>
            <option value="male">{t("gender.male")}</option>
            <option value="female">{t("gender.female")}</option>
            <option value="other">{t("gender.other")}</option>
          </select>
          {err("gender")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">{t("phone")}</Label>
          <Input id="phone" name="phone" type="tel" defaultValue={defaults.phone} disabled={isPending} />
          {err("phone")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cccd">{t("cccd")}</Label>
          <Input id="cccd" name="cccd" defaultValue={defaults.cccd} disabled={isPending} />
          {err("cccd")}
        </div>
      </div>

      <fieldset className="border-border space-y-4 rounded-md border p-4">
        <legend className="text-muted-foreground px-1 text-xs">{t("address")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="provinceCode">{t("province")}</Label>
            <select
              id="provinceCode"
              name="provinceCode"
              value={province}
              onChange={(e) => onProvinceChange(e.target.value)}
              disabled={isPending}
              className={SELECT_CLASS}
            >
              <option value="">—</option>
              {provinces.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wardCode">{t("ward")}</Label>
            <select
              id="wardCode"
              name="wardCode"
              value={ward}
              onChange={(e) => setWard(e.target.value)}
              disabled={isPending || loadingWards || !province}
              className={SELECT_CLASS}
            >
              <option value="">{loadingWards ? t("loading") : "—"}</option>
              {wards.map((w) => (
                <option key={w.code} value={w.code}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="addressDetail">{t("addressDetail")}</Label>
          <Input
            id="addressDetail"
            name="addressDetail"
            defaultValue={defaults.addressDetail}
            disabled={isPending}
          />
        </div>
      </fieldset>

      {formError && (
        <p className="text-destructive text-sm" role="alert">
          {formError}
        </p>
      )}

      <Button type="submit" size="lg" disabled={isPending}>
        {isPending ? t("saving") : mode === "create" ? t("create") : t("save")}
      </Button>
    </form>
  );
}
