import type { ConvertResponse } from "@contract";
import { CheckIcon, DownloadIcon, Loader2Icon, SendIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useBotStore } from "@/features/bot/botStore";
import { downloadUrl } from "@/lib/api";
import { useSendToWhatsApp } from "../../hooks/useSendToWhatsApp";

/** Send to WhatsApp (primary) + download menu (secondary). */
export function ResultActions({ result }: { result: ConvertResponse }) {
  return (
    <div className="flex gap-2">
      <SendButton resultId={result.id} />
      <DownloadMenu stickerUrl={result.sticker.url} audioUrl={result.audio?.url} />
    </div>
  );
}

function SendButton({ resultId }: { resultId: string }) {
  const bot = useBotStore((s) => s.status);
  const refreshBot = useBotStore((s) => s.refresh);
  const { phase, send } = useSendToWhatsApp(resultId);
  const ready = bot?.connected === true;

  const onClick = async () => {
    const r = await send();
    if (r.kind === "sent") toast.success(r.delivered === "native" ? "Enviado a tu chat con sonido" : "Enviado a tu chat");
    if (r.kind === "error") {
      toast.error(r.message);
      void refreshBot();
    }
  };

  const button = (
    <Button className="h-12 flex-1 rounded-full text-[15px] font-semibold" disabled={!ready || phase.kind === "sending"} onClick={onClick}>
      {phase.kind === "sending" ? (
        <Loader2Icon data-icon="inline-start" className="animate-spin" />
      ) : phase.kind === "sent" ? (
        <CheckIcon data-icon="inline-start" />
      ) : (
        <SendIcon data-icon="inline-start" />
      )}
      {phase.kind === "sending" ? "Enviando…" : phase.kind === "sent" ? "Enviado" : "Enviar a WhatsApp"}
    </Button>
  );

  if (ready) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex flex-1">{button}</span>
      </TooltipTrigger>
      <TooltipContent>
        {bot === null ? "Comprobando el bot…" : bot.available ? "El bot no está conectado a WhatsApp" : "Arranca el bot con npm run bot"}
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
