"use client";

/**
 * Add-service form — native form + useActionState (server-validated). No RHF:
 * the coerced numeric price doesn't map cleanly to an RHF resolver type, and
 * server Zod is the source of truth anyway. Resets on success via a key bump.
 */

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ServiceFormState } from "@/lib/catalog/service-schema";
import { createServiceAction } from "./actions";

export function AddServiceForm() {
  const t = useTranslations("admin.services");
  const formRef = useRef<HTMLFormElement>(null);
  const [state, dispatch, isPending] = useActionState<ServiceFormState, FormData>(
    createServiceAction,
    {
      status: "idle",
    },
  );

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  const fe = state.status === "error" ? state.fieldErrors : {};
  const formError = state.status === "error" ? state.formError : null;

  return (
    <form
      ref={formRef}
      action={dispatch}
      noValidate
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="service-name">{t("name")}</Label>
        <Input id="service-name" name="name" disabled={isPending} aria-invalid={!!fe.name} />
        {fe.name?.length ? (
          <p className="text-destructive text-sm" role="alert">
            {fe.name[0]}
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="service-price">{t("price")}</Label>
        <Input
          id="service-price"
          name="price"
          type="number"
          min={0}
          defaultValue={0}
          disabled={isPending}
        />
      </div>
      <Button type="submit" size="lg" disabled={isPending}>
        {isPending ? t("submitting") : t("add")}
      </Button>
      {formError && (
        <p className="text-destructive text-sm sm:self-center" role="alert">
          {formError}
        </p>
      )}
    </form>
  );
}
