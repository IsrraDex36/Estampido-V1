import { useState } from "react";
import { ApiError } from "@/lib/api";
import { notify } from "@/lib/notify";
import { PartialSendError, SEND_BATCH, type SendSummary, sendToSelf } from "./endpoints";
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
    const toast = `self-send:${label}`;
    const total = new Set(what.results ?? []).size + new Set(what.community ?? []).size;
    if (total > SEND_BATCH) notify.loading(`Enviando 0 de ${total}…`, { id: toast });
    try {
      const sum = await sendToSelf(what, (done, n) => {
        if (n > SEND_BATCH) notify.loading(`Enviando ${done} de ${n}…`, { id: toast });
      });
      const msg = sendMessage(sum, label);
      if (msg.kind === "error") {
        setState("idle");
        notify.error(msg.text, { id: toast });
        return false;
      }
      setState("sent");
      (msg.kind === "success" ? notify.success : notify.warning)(msg.text, { id: toast, description: msg.detail });
      return msg.kind === "success";
    } catch (raw) {
      setState("idle");
      const partial = raw instanceof PartialSendError ? raw : null;
      const err = partial ? partial.cause : raw;
      const done = partial?.summary.sent ?? 0;
      // Session no longer usable (device removed, expired, sealed for another browser/epoch): forget it,
      // re-link, then send ONLY what hadn't arrived yet.
      const notLinked = err instanceof Error && err.message === "not_linked";
      if (notLinked || (err instanceof ApiError && mustRelink(err.status, err.code))) {
        useSelfStore.getState().setSession(null);
        notify.error(notLinked ? "Vincula tu WhatsApp para enviar." : relinkReason((err as ApiError).code), { id: toast });
        const rest = partial?.remaining ?? what;
        useSelfStore.getState().openDialog(() => void run(rest, label));
        return false;
      }
      const base = err instanceof ApiError ? err.message : "No se pudo enviar a tu chat.";
      notify.error(done > 0 ? `Llegaron ${done} de ${partial?.summary.requested}. ${base}` : base, { id: toast });
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

/** Why we ask to link again, in plain words. Pure (tested). */
export function relinkReason(code: string): string {
  switch (code) {
    case "logged_out":
      return "Tu WhatsApp quitó este dispositivo (en Dispositivos vinculados). Vincúlalo otra vez.";
    case "expired":
      return "Tu vinculación venció por falta de uso. Vincula tu WhatsApp otra vez.";
    default:
      return "Actualizamos la seguridad de la vinculación: vincula tu WhatsApp otra vez (solo esta vez).";
  }
}

/**
 * Only when the SESSION itself is unusable (device removed, expired, sealed for
 * another browser/epoch). Malformed requests, timeouts, busy, rate limits:
 * keep the session and just report the error. Pure (tested).
 */
export function mustRelink(status: number, code: string): boolean {
  return code === "logged_out" || code === "expired" || (code === "invalid" && (status === 400 || status === 410));
}

/**
 * What to tell the person after a send, honestly. Pure (tested).
 * success: everything arrived · warning: some did · error: none did.
 */
export function sendMessage(
  s: SendSummary,
  label: string,
): { kind: "success" | "warning" | "error"; text: string; detail?: string } {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const notes = [
    s.skipped > 0 && `${plural(s.skipped, "ya no existe", "ya no existen")} (expiró o lo quitaron)`,
    s.failed > 0 && `${plural(s.failed, "no se pudo enviar", "no se pudieron enviar")}`,
    s.pending > 0 && `${plural(s.pending, "quedó pendiente", "quedaron pendientes")}: toca «Enviar» otra vez`,
  ].filter(Boolean) as string[];
  if (s.sent === 0) {
    return { kind: "error", text: s.skipped === s.requested ? "Esos stickers ya no existen." : "No se pudo enviar a tu chat.", detail: notes.join(" · ") || undefined };
  }
  if (s.sent === s.requested) {
    return { kind: "success", text: s.sent > 1 ? `${s.sent} stickers en tu chat «Tú»` : `${label} llegó a tu chat «Tú»` };
  }
  return { kind: "warning", text: `Llegaron ${s.sent} de ${s.requested} a tu chat «Tú»`, detail: notes.join(" · ") };
}
