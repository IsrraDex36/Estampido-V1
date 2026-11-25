import type { SendToWhatsAppResponse, WhatsAppStatus } from "@contract";
import { useCallback, useEffect, useState } from "react";
import { getWhatsAppStatus, sendToWhatsApp } from "@/lib/api";

export type SendPhase =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; delivered: SendToWhatsAppResponse["delivered"] }
  | { kind: "error"; message: string };

/** Bot availability + "send this result to my WhatsApp" state. */
export function useSendToWhatsApp(resultId: string) {
  const [bot, setBot] = useState<WhatsAppStatus | null>(null);
  const [phase, setPhase] = useState<SendPhase>({ kind: "idle" });

  const refresh = useCallback(async () => {
    setBot(await getWhatsAppStatus());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getWhatsAppStatus().then((s) => {
      if (!cancelled) setBot(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const send = useCallback(async (): Promise<SendPhase> => {
    setPhase({ kind: "sending" });
    try {
      const { delivered } = await sendToWhatsApp(resultId);
      const next: SendPhase = { kind: "sent", delivered };
      setPhase(next);
      return next;
    } catch (err) {
      const next: SendPhase = { kind: "error", message: err instanceof Error ? err.message : "Error al enviar." };
      setPhase(next);
      void refresh();
      return next;
    }
  }, [resultId, refresh]);

  return { bot, phase, send, refresh };
}
