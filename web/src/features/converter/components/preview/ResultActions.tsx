import { useState } from "react";
import type { ConvertResponse } from "@contract";
import { useShallow } from "zustand/react/shallow";
import {
  BookmarkIcon,
  CheckIcon,
  DownloadIcon,
  Loader2Icon,
  SendIcon,
  Share2Icon,
  Volume2Icon,
  TriangleAlertIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBotStatus } from "@/features/bot/api";
import { LinkDialog } from "@/features/bot/LinkDialog";
import { useLinkGate } from "@/features/bot/useLinkGate";
import { toItem, useCollectionStore } from "@/features/collection/collectionStore";
import { downloadUrl } from "@/lib/api";
import { notify } from "@/lib/notify";
import { canShareFiles, shareSticker } from "@/lib/share";
import { cn } from "@/lib/utils";
import { ActionTile } from "./ActionTile";
import { CreateInWhatsApp, WhatsAppCreatorDialog } from "./CreateInWhatsApp";
import { unlinkSelf } from "@/features/self/endpoints";
import { useSelfSend } from "@/features/self/useSelfSend";
import { PublishButton } from "./PublishButton";

/** WhatsApp card (primary, never a dead end) + publish / collection / download tiles. */
export function ResultActions({ result }: { result: ConvertResponse }) {
  return (
    <div className="space-y-3">
      <SendCard result={result} />
      <CreateInWhatsApp result={result} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ShareAction stickerUrl={result.sticker.url} />
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
  // Your own WhatsApp (linked device) sends to your own «Tú» chat: no shared number involved.
  const self = useSelfSend();
  const connected = bot?.available === true;
  const direct = self.linked;
  const sending = self.sending;
  const sent = self.sent;
  const share = canShareFiles();
  const [creatorOpen, setCreatorOpen] = useState(false);
  const { dialog } = useLinkGate();

  const doSend = () => self.send({ results: [result.id] }, "Tu sticker");

  const subtitle =
    bot === undefined
      ? "Comprobando el envío…"
      : !connected
        ? "El envío directo está en pausa. Para que llegue con sonido, créalo en WhatsApp con nuestro video (Android, WhatsApp Beta)."
        : sent
          ? "Llegó a tu chat «Tú». Mantenlo presionado → Añadir a favoritos ⭐ para usarlo y reenviarlo siempre."
          : direct
            ? "Llega a tu chat «Tú» con sonido, desde tu propio WhatsApp."
            : "Conecta tu WhatsApp una vez y te lo mandas a ti mismo, con sonido.";

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
        {direct && (
          <button
            type="button"
            className="mt-1 text-[12px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => {
              if (window.confirm("¿Quitar tu WhatsApp de Estampido? Se borra la sesión de este navegador y el dispositivo de tu teléfono.")) {
                void unlinkSelf().then(() => notify.success("Listo: tu WhatsApp ya no está vinculado."));
              }
            }}
          >
            Desvincular mi WhatsApp
          </button>
        )}
        {!sent && result.whatsapp && !result.whatsapp.ok && (
          <ul role="note" className="mt-2 space-y-1 rounded-xl bg-retro-a/10 p-2.5 text-[12px] leading-snug">
            {result.whatsapp.issues.map((issue) => (
              <li key={issue} className="flex gap-2">
                <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-retro-a" weight="fill" />
                {issue}
              </li>
            ))}
          </ul>
        )}
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
          {sending ? "Enviando…" : sent ? "Enviar otra vez" : direct ? "Enviar a mi WhatsApp" : "Conectar y enviar"}
        </Button>
      ) : (
        // Paused: the only way to keep the sound without the bot is WhatsApp's own creator.
        <div className="flex shrink-0 flex-col items-stretch gap-1.5 sm:items-end">
          <Button className="h-12 rounded-full px-6 text-[15px] font-semibold" onClick={() => setCreatorOpen(true)}>
            <Volume2Icon data-icon="inline-start" />
            Crear con sonido en WhatsApp
          </Button>
          <button
            type="button"
            className="text-[12px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => (share ? void shareSticker(result.sticker.url) : window.location.assign(downloadUrl(result.sticker.url)))}
          >
            {share ? "o compartir como imagen (sin sonido)" : "o descargar el sticker (sin sonido)"}
          </button>
          <WhatsAppCreatorDialog result={result} open={creatorOpen} onOpenChange={setCreatorOpen} />
        </div>
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

/**
 * «Compartir», always visible. Phones: the system share sheet with the
 * sticker (straight into a WhatsApp chat). Computers (no file sharing):
 * download it and say how to send it from WhatsApp Web.
 */
function ShareAction({ stickerUrl }: { stickerUrl: string }) {
  const share = canShareFiles();
  return (
    <ActionTile
      icon={<Share2Icon weight="duotone" />}
      title="Compartir"
      hint={share ? "A un chat" : "Descargar"}
      onClick={() => {
        if (share) {
          void shareSticker(stickerUrl);
          return;
        }
        const a = document.createElement("a");
        a.href = downloadUrl(stickerUrl);
        a.click();
        notify.success("Descargado: arrástralo a un chat de WhatsApp Web y se envía como sticker.");
      }}
    />
  );
}

function DownloadAction({ stickerUrl, audioUrl }: { stickerUrl: string; audioUrl?: string }) {
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
        <DropdownMenuItem asChild>
          <a href={stickerUrl.replace(/sticker\.webp$/, "whatsapp.mp4")}>
            <DownloadIcon /> Video para WhatsApp (.mp4)
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
