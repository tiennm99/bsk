"use client";

/**
 * Manual queue-counter override — one instance per shift. admin/receptionist
 * only (the queue page only renders this for those roles); posts to
 * setQueueCounterAction, which calls the set_queue_counter RPC.
 */

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SetQueueCounterState } from "@/lib/checkups/checkup-schema";
import { setQueueCounterAction } from "./actions";

export function CounterForm({ shiftId, currentValue }: { shiftId: number; currentValue: number }) {
  const t = useTranslations("queue");
  const [state, dispatch, isPending] = useActionState<SetQueueCounterState, FormData>(
    setQueueCounterAction,
    { status: "idle" },
  );

  return (
    <form action={dispatch} className="flex items-center gap-2">
      <input type="hidden" name="shiftId" value={shiftId} />
      <Input
        type="number"
        name="value"
        min={0}
        defaultValue={currentValue}
        disabled={isPending}
        aria-label={t("setCounter")}
        className="h-8 w-20 px-2 text-sm"
      />
      <Button type="submit" size="sm" variant="outline" disabled={isPending}>
        {isPending ? t("saving") : t("setCounter")}
      </Button>
      {state.status === "success" && (
        <span className="text-xs font-medium text-green-600" role="status">
          {t("saved")}
        </span>
      )}
      {state.status === "error" && state.formError && (
        <span className="text-destructive text-xs" role="alert">
          {state.formError}
        </span>
      )}
    </form>
  );
}
