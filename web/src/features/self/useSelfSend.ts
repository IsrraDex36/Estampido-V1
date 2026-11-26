import { useState } from "react";
import { ApiError } from "@/lib/api";
import { notify } from "@/lib/notify";
import { sendToSelf } from "./endpoints";
import { useSelfStore } from "./selfStore";

type What = { results?: string[]; community?: string[]; pack?: string };

/**
 * «Enviar a mi WhatsApp» through the person's own linked device. Not linked
 * yet → the link dialog opens and the send runs right after linking. If
 * WhatsApp dropped the device → forget it and ask to link again.
 */
export function useSelfSend() {
  const linked = useSelfStore((s) => s.session !== null);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  const run = async (what: What, label: string): Promise<boolean> => {
    setState("sending");
    try {
      const { sent } = await sendToSelf(what);
      setState("sent");
      notify.success(sent > 1 ? `${sent} stickers en tu chat «Tú»` : `${label} llegó a tu chat «Tú»`);
      return true;
    } catch (err) {
      setState("idle");
      // Session no longer usable (device removed, expired, sealed for another browser/epoch): forget it, re-link.
      if (err instanceof ApiError && (err.status === 410 || ["logged_out", "invalid", "expired"].includes(err.code))) {
        useSelfStore.getState().setSession(null);
        notify.error("Tu WhatsApp quitó este dispositivo. Vincúlalo otra vez.");
        useSelfStore.getState().openDialog(() => void run(what, label));
        return false;
      }
      notify.error(err instanceof ApiError ? err : null, { fallback: "No se pudo enviar a tu chat." });
      return false;
    }
  };

  const send = (what: What, label = "El sticker") => {
    if (!useSelfStore.getState().session) {
      useSelfStore.getState().openDialog(() => void run(what, label));
      return;
    }
    void run(what, label);
  };

  return { linked, sending: state === "sending", sent: state === "sent", send };
}
