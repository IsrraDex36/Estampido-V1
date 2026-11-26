import type { ConvertResponse } from "@contract";
import { useState } from "react";
import { CheckIcon, DownloadIcon, Loader2Icon, Share2Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

const MP4_NAME = "estampido-para-whatsapp.mp4";

/** Same caps as the server (WhatsApp keeps ≈5 s for video stickers, ≈10 s for still ones). */
const capFor = (r: ConvertResponse) => (r.sticker.animated ? 5 : 10);

/**
 * Second path: download a square MP4 and let WhatsApp itself turn it into a
 * sound sticker (Stickers → Crear → video). Android beta only for now.
 */
export function CreateInWhatsApp({ result }: { result: ConvertResponse }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-tight font-semibold">
            Crearlo tú en WhatsApp{" "}
            <span className="ml-1 rounded-full bg-muted px-2 py-0.5 align-middle text-[11px] font-medium text-muted-foreground">
              beta
            </span>
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">Sin vincular nada · Android con WhatsApp Beta</p>
        </div>
        <DialogTrigger asChild>
          <Button variant="secondary" className="shrink-0 rounded-full">
            Cómo
          </Button>
        </DialogTrigger>
      </div>
      <DialogContent className="max-w-md">{open && <Guide result={result} />}</DialogContent>
    </Dialog>
  );
}

/** The same guide, opened from elsewhere (e.g. the main card while the bot is paused). */
export function WhatsAppCreatorDialog({
  result,
  open,
  onOpenChange,
}: {
  result: ConvertResponse;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">{open && <Guide result={result} />}</DialogContent>
    </Dialog>
  );
}

function Guide({ result }: { result: ConvertResponse }) {
  const [file, setFile] = useState<{ url: string; blob: Blob } | null>(null);
  const [busy, setBusy] = useState(false);
  const cap = capFor(result);
  const longer = (result.audio?.durationSec ?? 0) > cap + 0.05;

  const prepare = async (): Promise<{ url: string; blob: Blob } | null> => {
    if (file) return file;
    setBusy(true);
    try {
      const res = await fetch(`/api/results/${result.id}/whatsapp.mp4`);
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message ?? "No se pudo preparar el video.");
      const blob = await res.blob();
      const ready = { url: URL.createObjectURL(blob), blob };
      setFile(ready);
      return ready;
    } catch (err) {
      notify.error(err, { fallback: "No se pudo preparar el video." });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    const f = await prepare();
    if (!f) return;
    const a = document.createElement("a");
    a.href = f.url;
    a.download = MP4_NAME;
    a.click();
  };

  const mp4File = file ? new File([file.blob], MP4_NAME, { type: "video/mp4" }) : null;
  const canShare =
    typeof navigator !== "undefined" && typeof navigator.canShare === "function" && mp4File !== null && navigator.canShare({ files: [mp4File] });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Crearlo tú en WhatsApp</DialogTitle>
        <DialogDescription>
          WhatsApp está estrenando su propio creador de stickers con sonido. Te damos el video listo; WhatsApp lo convierte.
        </DialogDescription>
      </DialogHeader>

      <ol className="space-y-3 text-[14px]">
        <Step n={1} done={Boolean(file)}>
          <b>Descarga el video</b> (MP4 cuadrado con tu sonido, máx. {cap} s).
          <div className="mt-2 flex flex-wrap gap-2">
            <Button className="rounded-full" disabled={busy} onClick={() => void download()}>
              {busy ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <DownloadIcon data-icon="inline-start" />}
              {busy ? "Preparando…" : file ? "Descargar otra vez" : "Descargar video"}
            </Button>
            {canShare && mp4File && (
              <Button
                variant="secondary"
                className="rounded-full"
                onClick={() => void navigator.share({ files: [mp4File] }).catch(() => {})}
              >
                <Share2Icon data-icon="inline-start" />
                Guardar en galería…
              </Button>
            )}
          </div>
          {longer && (
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              Tu sonido dura más: el video usa los primeros {cap} s, que es lo que WhatsApp guarda.
            </p>
          )}
        </Step>
        <Step n={2}>
          En WhatsApp abre un chat → ícono de <b>stickers</b> → <b>Crear (+)</b>.
        </Step>
        <Step n={3}>
          Elige el video de tu galería y confirma: queda como <b>sticker con sonido</b> en tus stickers.
        </Step>
      </ol>

      <div className="space-y-1.5 rounded-2xl bg-muted/60 p-3.5 text-[12px] leading-snug text-muted-foreground">
        <p>
          <b className="text-foreground">Hoy solo Android con WhatsApp Beta</b>, y Meta lo activa poco a poco por cuenta. Si
          no te aparece la opción de crear desde video, usa «Enviar a mi WhatsApp».
        </p>
        <p>Ojo: si mandas el MP4 directo en un chat, llega como video normal, no como sticker.</p>
      </div>
    </>
  );
}

function Step({ n, done = false, children }: { n: number; done?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold",
          done ? "bg-sound text-background" : "bg-muted",
        )}
      >
        {done ? <CheckIcon className="size-3.5" weight="bold" /> : n}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}
