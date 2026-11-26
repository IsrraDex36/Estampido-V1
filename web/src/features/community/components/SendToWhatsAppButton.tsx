import type { CommunitySticker } from "@contract";
import { CheckIcon, Loader2Icon, SendIcon } from "@/components/icons";
import { useBotStatus, useSendToWhatsApp } from "@/features/bot/api";
import { LinkDialog } from "@/features/bot/LinkDialog";
import { useLinkGate } from "@/features/bot/useLinkGate";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

/**
 * «Enviar a WhatsApp» for a community sticker: same flow as a fresh result —
 * one tap when this browser is linked; otherwise the link dialog opens and the
 * send runs as soon as the code arrives. Paused (disabled) while the bot is off.
 */
export function SendToWhatsAppButton({ sticker, className }: { sticker: CommunitySticker; className?: string }) {
  const bot = useBotStatus();
  const send = useSendToWhatsApp("community");
  const { gate, dialog } = useLinkGate();
  const connected = bot?.connected === true;
  const sending = send.isPending;
  const sent = send.isSuccess;

  const onClick = () =>
    gate(() =>
      send.mutate(sticker.id, {
        onSuccess: ({ delivered }) =>
          notify.success(
            delivered === "native"
              ? `«${sticker.title}» llegó a tu chat con sonido`
              : delivered === "separate"
                ? `«${sticker.title}» llegó a tu chat (sticker + nota de voz)`
                : `«${sticker.title}» llegó a tu chat`,
          ),
      }),
    );

  const label = !connected
    ? "El envío directo está en pausa"
    : sent
      ? `«${sticker.title}» enviado a tu WhatsApp`
      : `Enviar «${sticker.title}» a mi WhatsApp`;

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={!connected || sending}
        aria-label={label}
        title={label}
        className={cn(
          "flex h-9 w-full items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
          sent ? "bg-sound-soft text-sound" : "bg-sound text-background hover:bg-sound/90",
          !connected && "bg-muted text-muted-foreground hover:bg-muted",
          className,
        )}
      >
        {sending ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : sent ? (
          <CheckIcon className="size-4" weight="bold" />
        ) : (
          <SendIcon className="size-4" weight="fill" />
        )}
        <span className="sm:hidden">{sending ? "Enviando…" : sent ? "Enviado" : "Enviar"}</span>
        <span className="hidden sm:inline">{sending ? "Enviando…" : sent ? "Enviado a tu chat" : "Enviar a WhatsApp"}</span>
      </button>
      <LinkDialog {...dialog} />
    </>
  );
}
