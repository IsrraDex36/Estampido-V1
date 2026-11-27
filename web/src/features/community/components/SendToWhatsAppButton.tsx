import type { CommunitySticker } from "@contract";
import { CheckIcon, Loader2Icon, PauseIcon, SendIcon } from "@/components/icons";
import { useBotStatus } from "@/features/bot/api";
import { useSelfSend } from "@/features/self/useSelfSend";
import { cn } from "@/lib/utils";

/**
 * «Enviar a WhatsApp» for a community sticker: same flow as a fresh result —
 * one tap when this browser is linked; otherwise the link dialog opens and the
 * send runs as soon as the code arrives. Paused (disabled) while the bot is off.
 */
export function SendToWhatsAppButton({
  sticker,
  className,
  compact = false,
}: {
  sticker: CommunitySticker;
  className?: string;
  /** Round icon-only button (shelf cards). */
  compact?: boolean;
}) {
  const bot = useBotStatus();
  // Your own WhatsApp → your own «Tú» chat (works even while the Estampido number is offline).
  const self = useSelfSend();
  const connected = bot?.available === true;
  const sending = self.sending;
  const sent = self.sent;
  const onClick = () => self.send({ community: [sticker.id] }, `«${sticker.title}»`);

  const label = !connected
    ? "El envío directo está en pausa"
    : sent
      ? `«${sticker.title}» enviado a tu WhatsApp`
      : `Enviar «${sticker.title}» a mi WhatsApp`;

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!connected || sending}
        aria-label={label}
        title={label}
        className={cn(
          "grid size-8 place-items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
          sent ? "bg-sound-soft text-sound" : "bg-sound text-background hover:bg-sound/90",
          !connected && "bg-muted text-muted-foreground hover:bg-muted",
          className,
        )}
      >
        {bot !== undefined && !connected ? (
          <PauseIcon className="size-3.5" weight="fill" />
        ) : sending ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : sent ? (
          <CheckIcon className="size-3.5" weight="bold" />
        ) : (
          <SendIcon className="size-3.5" weight="fill" />
        )}
      </button>
    );
  }

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
        {bot !== undefined && !connected ? (
          <PauseIcon className="size-4" weight="fill" />
        ) : sending ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : sent ? (
          <CheckIcon className="size-4" weight="bold" />
        ) : (
          <SendIcon className="size-4" weight="fill" />
        )}
        {bot !== undefined && !connected ? (
          // Say why it can't be used, instead of a mute grey button.
          <span>Envío en pausa</span>
        ) : (
          <>
            <span className="sm:hidden">{sending ? "Enviando…" : sent ? "Enviado" : "Enviar"}</span>
            <span className="hidden sm:inline">{sending ? "Enviando…" : sent ? "Enviado a tu chat" : "Enviar a WhatsApp"}</span>
          </>
        )}
      </button>
    </>
  );
}
