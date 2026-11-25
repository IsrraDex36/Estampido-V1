import type { SendToWhatsAppResponse } from "@contract";
import { useCallback, useState } from "react";
import { sendToWhatsApp } from "@/lib/api";

export type SendPhase =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; delivered: SendToWhatsAppResponse["delivered"] }
  | { kind: "error"; message: string };

/** "Send this result to my WhatsApp" state machine (bot status lives in useBotStatus). */
export function useSendToWhatsApp(resultId: string) {
  const [phase, setPhase] = useState<SendPhase>({ kind: "idle" });

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
      return next;
    }
  }, [resultId]);

  return { phase, send };
}
