import { CheckIcon, Loader2Icon, RefreshCwIcon, SendIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSendToWhatsApp } from "../hooks/useSendToWhatsApp";

interface SendToWhatsAppButtonProps {
  resultId: string;
  hasAudio: boolean;
}

/** Primary action: deliver the result to the bot owner's own chat ("Tú"). */
export function SendToWhatsAppButton({ resultId, hasAudio }: SendToWhatsAppButtonProps) {
  const { bot, phase, send, refresh } = useSendToWhatsApp(resultId);
  const ready = bot?.connected === true;

  const onClick = async () => {
    const result = await send();
    if (result.kind === "sent") {
      toast.success(
        result.delivered === "native" ? "Sticker con sonido enviado a tu chat 🔊" : "Sticker enviado a tu chat",
      );
    } else if (result.kind === "error") {
      toast.error(result.message);
    }
  };

  const label =
    phase.kind === "sending"
      ? "Enviando…"
      : phase.kind === "sent"
        ? "Enviado"
        : hasAudio
          ? "Enviar a mi WhatsApp 🔊"
          : "Enviar a mi WhatsApp";

  return (
    <div className="space-y-1.5">
      <Button className="w-full" size="lg" disabled={!ready || phase.kind === "sending"} onClick={onClick}>
        {phase.kind === "sending" ? (
          <Loader2Icon data-icon="inline-start" className="animate-spin" />
        ) : phase.kind === "sent" ? (
          <CheckIcon data-icon="inline-start" />
        ) : (
          <SendIcon data-icon="inline-start" />
        )}
        {label}
      </Button>
      <p className="flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
        {bot === null ? (
          "Comprobando bot…"
        ) : ready ? (
          "Llega a tu chat «Tú» como sticker con sonido."
        ) : (
          <>
            {bot.available ? "El bot no está conectado a WhatsApp." : "Bot apagado: ejecuta"}
            {!bot.available && <code className="rounded bg-muted px-1">npm run bot</code>}
            <Button variant="link" size="xs" onClick={() => void refresh()}>
              <RefreshCwIcon data-icon="inline-start" />
              Reintentar
            </Button>
          </>
        )}
      </p>
    </div>
  );
}
