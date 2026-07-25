"use client";

/**
 * Live queue refresh. Subscribes to bsk.checkups changes on a BSK-prefixed
 * channel and refreshes the RSC tree so the server-rendered queue re-fetches.
 * Realtime authorization runs through RLS, so only BSK-enrolled users receive
 * these events. If Realtime isn't enabled on the table, the page still works —
 * it just won't update until the next navigation.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function QueueRealtime() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("bsk:queue")
      .on(
        "postgres_changes",
        { event: "*", schema: "bsk", table: "checkups" },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
