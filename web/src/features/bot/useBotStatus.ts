import type { WhatsAppStatus } from "@contract";
import { useCallback, useEffect, useState } from "react";
import { getWhatsAppStatus } from "@/lib/api";

const POLL_MS = 10_000;

/** Bot availability, polled while the tab is visible. null = still checking. */
export function useBotStatus() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);

  const refresh = useCallback(async () => {
    const next = await getWhatsAppStatus();
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (document.visibilityState === "visible") {
        void getWhatsAppStatus().then((s) => alive && setStatus(s));
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  return { status, refresh };
}
