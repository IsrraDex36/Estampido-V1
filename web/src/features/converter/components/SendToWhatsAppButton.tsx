import type { WhatsAppStatus } from "@contract";
import { CheckIcon, Loader2Icon, RefreshCwIcon, SendIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSendToWhatsApp } from "../hooks/useSendToWhatsApp";

interface SendToWhatsAppButtonProps {
  resultId: string;
  hasAudio: boolean;
  bot: WhatsAppStatus | null;
  onRefreshBot: () => void;
}

/** Primary action: deliver the result to the bot owner's own chat. */
export function SendToWhatsAppButton({ resultId, hasAudio, bot, onRefreshBot }: SendToWhatsAppButtonProps) {
  const { phase, send } = useSendToWhatsApp(resultId);
  const ready = bot?.connected === true;

  const onClick = async () => {
    const result = await send();
    if (result.kind === "sent") {
      toast.success(result.delivered === "native" ? "Enviado a tu chat como sticker con sonido 🔊" : "Sticker enviado a tu chat");
    } else if (result.kind === "error") {
      toast.error(result.message);
      onRefreshBot();
    }
  };

  const icon =
    phase.kind === "sending" ? (
      <Loader2Icon className="animate-spin" />
    ) : phase.kind === "sent" ? (
      <CheckIcon />
    ) : (
      <SendIcon />
    );

  return (
    <div className="space-y-1.5">
      <Button
        className="h-11 w-full text-[15px] shadow-sm shadow-primary/20"
        disabled={!ready || phase.kind === "sending"}
        onClick={onClick}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={phase.kind}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-2 [&_svg]:size-4"
          >
            {icon}
            {phase.kind === "sending"
              ? "Enviando…"
              : phase.kind === "sent"
                ? "Enviado · enviar otra vez"
                : `Enviar a mi WhatsApp${hasAudio ? " 🔊" : ""}`}
          </motion.span>
        </AnimatePresence>
      </Button>
      <p className="flex min-h-5 items-center justify-center gap-1 text-center text-xs text-muted-foreground">
        {bot === null ? (
          "Comprobando el bot…"
        ) : ready ? (
          "Llega a tu chat contigo mismo."
        ) : (
          <>
            {bot.available ? "El bot no está conectado a WhatsApp." : "Bot apagado: ejecuta"}
            {!bot.available && <code className="rounded bg-muted px-1 font-mono">npm run bot</code>}
            <Button variant="link" size="xs" onClick={onRefreshBot}>
              <RefreshCwIcon data-icon="inline-start" />
              Reintentar
            </Button>
          </>
        )}
      </p>
    </div>
  );
}
