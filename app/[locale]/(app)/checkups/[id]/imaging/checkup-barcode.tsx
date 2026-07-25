"use client";

/**
 * Checkup-id barcode (code128, via bwip-js) with a print affordance. Encodes
 * the CHECKUP ID only — never CCCD or any other patient PII (privacy
 * decision, PLAN §5) — so a lost/misplaced printout is not a data leak.
 * Rendered to a canvas ref inside an effect (bwip-js needs a live canvas
 * element, unavailable during SSR).
 */

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import bwipjs from "bwip-js/browser";

import { Button } from "@/components/ui/button";

export function CheckupBarcode({ checkupId }: { checkupId: number }) {
  const t = useTranslations("imaging");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Default state is already error=false; only the failure path needs to
    // flip it (this component is remounted per checkup page, so there's no
    // stale-error case to reset from a prior render). The render call is
    // deferred to a microtask so a thrown error reports via a callback
    // rather than a setState call directly in the effect body.
    queueMicrotask(() => {
      try {
        bwipjs.toCanvas(canvas, {
          bcid: "code128",
          text: String(checkupId),
          scale: 3,
          height: 12,
          includetext: true,
          textxalign: "center",
        });
      } catch {
        setError(true);
      }
    });
  }, [checkupId]);

  return (
    <section className="border-border space-y-3 rounded-md border p-4">
      <h2 className="text-foreground text-sm font-medium print:hidden">{t("barcode")}</h2>
      <div className="flex flex-col items-center gap-2">
        <canvas ref={canvasRef} />
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {t("errorGeneric")}
          </p>
        )}
      </div>
      <Button type="button" variant="outline" onClick={() => window.print()} className="print:hidden">
        {t("print")}
      </Button>
    </section>
  );
}
