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
import { LinkDialog } from "@/features/bot/LinkDialog";
import { useLinkGate } from "@/features/bot/useLinkGate";
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
  const { gate, dialog } = useLinkGate();
  const ready = bot?.connected === true;
  // The mutation is shared per component; only reflect it for this result.
  const mine = send.variables === resultId;
  const sending = mine && send.isPending;
  const sent = mine && send.isSuccess;

  // Errors: global MutationCache toast (ApiError message) + bot re-check in the hook.
  // Not linked yet → the link dialog opens and the send runs as soon as it's linked.
  const onClick = () =>
    gate(() =>
      send.mutate(resultId, {
        onSuccess: ({ delivered }) =>
          notify.success(delivered === "native" ? "Enviado a tu chat con sonido" : "Enviado a tu chat"),
      }),
    );

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

  if (ready) {
    return (
      <>
        {button}
        <LinkDialog {...dialog} />
      </>
    );
  }
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
        {canShareFiles() && (
          <DropdownMenuItem onSelect={() => void shareSticker(stickerUrl)}>Compartir…</DropdownMenuItem>
        )}
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

/** Phones: native share sheet with the .webp (fallback when WhatsApp sending isn't available). */
function canShareFiles(): boolean {
  try {
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([""], "x.webp", { type: "image/webp" })] });
  } catch {
    return false;
  }
}

async function shareSticker(url: string): Promise<void> {
  try {
    const blob = await (await fetch(url)).blob();
    await navigator.share({ files: [new File([blob], "estampido.webp", { type: "image/webp" })], title: "Sticker de Estampido" });
  } catch (err) {
    if (!(err instanceof DOMException && err.name === "AbortError")) notify.error("No se pudo compartir. Descárgalo y envíalo desde WhatsApp.");
  }
}
