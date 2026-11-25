import type { ConvertResponse } from "@contract";
import { CheckIcon, DownloadIcon, Loader2Icon, SendIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useBotStatus, useSendToWhatsApp } from "@/features/bot/api";
import { downloadUrl } from "@/lib/api";
import { notify } from "@/lib/notify";
import { PublishButton } from "./PublishButton";

/** Send to WhatsApp (primary) + publish + download menu (secondary). */
export function ResultActions({ result }: { result: ConvertResponse }) {
  return (
    <div className="flex flex-wrap gap-2">
      <SendButton resultId={result.id} />
      <PublishButton result={result} />
      <DownloadMenu stickerUrl={result.sticker.url} audioUrl={result.audio?.url} />
    </div>
  );
}

function SendButton({ resultId }: { resultId: string }) {
  const bot = useBotStatus();
  const send = useSendToWhatsApp();
  const ready = bot?.connected === true;
  // The mutation is shared per component; only reflect it for this result.
  const mine = send.variables === resultId;
  const sending = mine && send.isPending;
  const sent = mine && send.isSuccess;

  // Errors: global MutationCache toast (ApiError message) + bot re-check in the hook.
  const onClick = () =>
    send.mutate(resultId, {
      onSuccess: ({ delivered }) =>
        notify.success(delivered === "native" ? "Enviado a tu chat con sonido" : "Enviado a tu chat"),
    });

  const button = (
    <Button className="h-12 min-w-48 flex-1 rounded-full text-[15px] font-semibold" disabled={!ready || sending} onClick={onClick}>
      {sending ? (
        <Loader2Icon data-icon="inline-start" className="animate-spin" />
      ) : sent ? (
        <CheckIcon data-icon="inline-start" />
      ) : (
        <SendIcon data-icon="inline-start" />
      )}
      {sending ? "Enviando…" : sent ? "Enviado" : "Enviar a WhatsApp"}
    </Button>
  );

  if (ready) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex flex-1">{button}</span>
      </TooltipTrigger>
      <TooltipContent>
        {bot === undefined ? "Comprobando el bot…" : bot.available ? "El bot no está conectado a WhatsApp" : "Arranca el bot con npm run bot"}
      </TooltipContent>
    </Tooltip>
  );
}

function DownloadMenu({ stickerUrl, audioUrl }: { stickerUrl: string; audioUrl?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="icon" className="size-12 rounded-full" aria-label="Descargar">
          <DownloadIcon className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem asChild>
          <a href={downloadUrl(stickerUrl)}>Sticker (.webp)</a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild disabled={!audioUrl}>
          <a href={audioUrl ? downloadUrl(audioUrl) : undefined}>Sonido (.ogg)</a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
