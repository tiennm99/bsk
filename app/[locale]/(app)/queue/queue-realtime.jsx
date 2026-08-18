"use client";

/**
 * Live queue refresh. Subscribes to bsk.checkups changes on a BSK-prefixed
 * channel and refreshes the RSC tree so the server-rendered queue re-fetches.
 * Realtime authorization runs through RLS, so only BSK-enrolled users receive
 * these events. If Realtime isn't enabled on the table, the page still works —
 * it just won't update until the next navigation.
 *
 * Also renders a small connection/staleness indicator (color + icon + text,
 * never color alone) so a doctor never trusts a frozen queue: live vs
 * disconnected, plus the wall-clock time of the last received change. State is
 * set from the subscribe/event callbacks (not the effect body) to satisfy the
 * react-hooks/purity rule.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Wifi, WifiOff } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/** @typedef {"live" | "disconnected"} ConnectionStatus */

const timeFormatter = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** Realtime connection badge: subscribes to queue changes and refreshes the route on updates. @returns {import("react").JSX.Element} */
export function QueueRealtime() {
  const router = useRouter();
  const t = useTranslations("queue");
  const [status, setStatus] = useState(/** @type {ConnectionStatus} */ ("disconnected"));
  const [lastUpdatedAt, setLastUpdatedAt] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("bsk:queue")
      .on("postgres_changes", { event: "*", schema: "bsk", table: "checkups" }, () => {
        setLastUpdatedAt(timeFormatter.format(new Date()));
        router.refresh();
      })
      .subscribe((subscribeStatus) => {
        setStatus(subscribeStatus === "SUBSCRIBED" ? "live" : "disconnected");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router]);

  const isLive = status === "live";

  return (
    <div className="text-muted-foreground mb-4 flex items-center gap-1.5 text-xs" role="status">
      {isLive ? (
        <Wifi className="size-3.5 text-green-600 dark:text-green-400" aria-hidden="true" />
      ) : (
        <WifiOff className="text-destructive size-3.5" aria-hidden="true" />
      )}
      <span className={isLive ? "text-green-700 dark:text-green-400" : "text-destructive"}>
        {isLive ? t("live") : t("disconnected")}
      </span>
      {lastUpdatedAt && <span>· {t("updatedAt", { time: lastUpdatedAt })}</span>}
    </div>
  );
}
