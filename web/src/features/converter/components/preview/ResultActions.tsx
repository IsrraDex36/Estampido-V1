import type { ConvertResponse } from "@contract";
import { useShallow } from "zustand/react/shallow";
import {
  BookmarkIcon,
  CheckIcon,
  DownloadIcon,
  Loader2Icon,
  SendIcon,
  Share2Icon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBotStatus, useSendToWhatsApp } from "@/features/bot/api";
import { LinkDialog } from "@/features/bot/LinkDialog";
import { useLinkGate } from "@/features/bot/useLinkGate";
import { toItem, useCollectionStore } from "@/features/collection/collectionStore";
import { downloadUrl } from "@/lib/api";
import { notify } from "@/lib/notify";
import { canShareFiles, shareSticker } from "@/lib/share";
import { cn } from "@/lib/utils";
import { ActionTile } from "./ActionTile";
import { PublishButton } from "./PublishButton";

/** WhatsApp card (primary, never a dead end) + publish / collection / download tiles. */
export function ResultActions({ result }: { result: ConvertResponse }) {
  return (
    <div className="space-y-3">
      <SendCard result={result} />
      <div className="grid grid-cols-3 gap-2">
        <PublishButton result={result} />
        <CollectionAction result={result} />
        <DownloadAction stickerUrl={result.sticker.url} audioUrl={result.audio?.url} />
      </div>
    </div>
  );
}

/**
 * Bot connected + linked → one tap sends to my chat. Connected but not
 * linked → «Vincular y enviar» (the send runs as soon as it's linked).
 * Bot off → share sheet (phones) or download, with a one-line how-to.
 */
function SendCard({ result }: { result: ConvertResponse }) {
  const bot = useBotStatus();
  const send = useSendToWhatsApp();
  const { gate, linked, phone, dialog } = useLinkGate();
  const connected = bot?.connected === true;
  const direct = connected && (linked || bot?.selfSend === true);
  const mine = send.variables === result.id;
  const sending = mine && send.isPending;
  const sent = mine && send.isSuccess;
  const share = canShareFiles();

  const doSend = () =>
    gate(() =>
      send.mutate(result.id, {
        onSuccess: ({ delivered }) =>
          notify.success(delivered === "native" ? "Enviado a tu chat con sonido" : "Enviado a tu chat"),
      }),
    );

  const subtitle =
    bot === undefined
      ? "Comprobando el envío…"
      : !connected
        ? share
          ? "El envío directo está en pausa: compártelo desde aquí a WhatsApp."
          : "El envío directo está en pausa: descárgalo y mándalo desde WhatsApp Web."
        : sent
          ? `Revisa tu chat${phone ? ` ${phone}` : ""}: llegó con su sonido.`
          : direct
            ? `Llega a tu chat${phone ? ` ${phone}` : ""} como sticker con sonido.`
            : "Primero vincula tu número (una sola vez, 10 segundos).";

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center",
        sent ? "bg-sound-soft" : "bg-muted/60",
      )}
      aria-live="polite"
    >
      <span
        className={cn(
          "hidden size-11 shrink-0 place-items-center rounded-full sm:grid",
          sent ? "bg-sound text-background" : "bg-sound-soft text-sound",
        )}
      >
        {sent ? <CheckIcon className="size-5" weight="bold" /> : <SendIcon className="size-5" weight="duotone" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-tight font-semibold">{sent ? "¡Enviado a WhatsApp!" : "Mándalo a WhatsApp"}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{subtitle}</p>
      </div>
      {connected || bot === undefined ? (
        <Button
          className="h-12 shrink-0 rounded-full px-6 text-[15px] font-semibold sm:min-w-44"
          disabled={bot === undefined || sending}
          variant={sent ? "secondary" : "default"}
          onClick={doSend}
        >
          {sending ? (
            <Loader2Icon data-icon="inline-start" className="animate-spin" />
          ) : sent ? (
            <SendIcon data-icon="inline-start" />
          ) : (
            <SendIcon data-icon="inline-start" weight="fill" />
          )}
          {sending ? "Enviando…" : sent ? "Enviar otra vez" : direct ? "Enviar a mi WhatsApp" : "Vincular y enviar"}
        </Button>
      ) : share ? (
        <Button className="h-12 shrink-0 rounded-full px-6 text-[15px] font-semibold" onClick={() => void shareSticker(result.sticker.url)}>
          <Share2Icon data-icon="inline-start" />
          Compartir
        </Button>
      ) : (
        <Button asChild className="h-12 shrink-0 rounded-full px-6 text-[15px] font-semibold">
          <a href={downloadUrl(result.sticker.url)}>
            <DownloadIcon data-icon="inline-start" />
            Descargar sticker
          </a>
        </Button>
      )}
      <LinkDialog {...dialog} />
    </div>
  );
}

/** Every result lands in the collection automatically; this shows it and lets you undo / jump there. */
function CollectionAction({ result }: { result: ConvertResponse }) {
  const { saved, add } = useCollectionStore(
    useShallow((s) => ({ saved: s.items.some((i) => i.id === result.id), add: s.add })),
  );
  if (!saved) {
    return (
      <ActionTile
        icon={<BookmarkIcon weight="duotone" />}
        title="Guardar"
        hint="En tu colección"
        onClick={() => {
          add(toItem(result));
          notify.success("Guardado en tu colección");
        }}
      />
    );
  }
  return (
    <ActionTile
      done
      icon={<BookmarkIcon weight="fill" />}
      title="En colección"
      hint="Ver todos"
      onClick={() => document.getElementById("sec-04")?.scrollIntoView({ behavior: "smooth", block: "start" })}
      aria-label="En tu colección: ir a la colección"
    />
  );
}

function DownloadAction({ stickerUrl, audioUrl }: { stickerUrl: string; audioUrl?: string }) {
  const share = canShareFiles();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ActionTile
          icon={<DownloadIcon weight="duotone" />}
          title="Descargar"
          hint={audioUrl ? "Con sonido" : "Sticker"}
          aria-label="Descargar"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {share && (
          <DropdownMenuItem onSelect={() => void shareSticker(stickerUrl)}>
            <Share2Icon /> Compartir…
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <a href={downloadUrl(stickerUrl)}>
            <DownloadIcon /> Sticker (.webp)
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild disabled={!audioUrl}>
          <a href={audioUrl ? downloadUrl(audioUrl) : undefined}>
            <DownloadIcon /> Sonido (.ogg)
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
