"use client";

/** Medicine form — shared create/edit. Native form → Server Action (redirects). */

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MedicineFormState } from "@/lib/catalog/medicine-schema";

export type MedicineDefaults = {
  id?: number;
  name: string;
  unit: string;
  salePrice: string;
  costPrice: string;
  company: string;
  route: string;
};

export function MedicineForm({
  mode,
  action,
  defaults,
}: {
  mode: "create" | "edit";
  action: (prev: MedicineFormState, formData: FormData) => Promise<MedicineFormState>;
  defaults: MedicineDefaults;
}) {
  const t = useTranslations("admin.medicines");
  const [state, dispatch, isPending] = useActionState<MedicineFormState, FormData>(action, { status: "idle" });
  const fe = state.status === "error" ? state.fieldErrors : {};
  const formError = state.status === "error" ? state.formError : null;

  const field = (name: keyof MedicineDefaults, label: string, type = "text") => (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaults[name]} disabled={isPending} min={type === "number" ? 0 : undefined} />
      {fe[name]?.length ? (
        <p className="text-destructive text-sm" role="alert">
          {fe[name][0]}
        </p>
      ) : null}
    </div>
  );

  return (
    <form action={dispatch} noValidate className="space-y-4">
      {mode === "edit" && <input type="hidden" name="id" value={defaults.id} />}
      {field("name", t("name"))}
      <div className="grid gap-4 sm:grid-cols-2">
        {field("unit", t("unit"))}
        {field("salePrice", t("salePrice"), "number")}
        {field("costPrice", t("costPrice"), "number")}
        {field("company", t("company"))}
        {field("route", t("route"))}
      </div>
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
