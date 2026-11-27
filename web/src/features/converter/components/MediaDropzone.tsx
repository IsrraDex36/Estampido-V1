import { GifIcon, ImageIcon, PasteIcon, PlusIcon, SwapIcon, VideoIcon, XIcon } from "@/components/icons";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { type DragEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { canReadClipboard, mediaFromPaste, readClipboardMedia, wantsMediaPaste } from "@/lib/clipboard";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { selectBusy, useConverterStore } from "../store/converterStore";
import { usePlaybackStore } from "../store/playbackStore";
import { notify } from "@/lib/notify";
import { VideoEditor } from "./trim/VideoEditor";

const KIND_LABEL = { video: "Video", gif: "GIF", image: "Imagen" } as const;
const PASTE_KEY = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘V" : "Ctrl+V";

/** Pick / drop the source clip, then preview it. Reads & writes the stores directly. */
export function MediaDropzone() {
  const file = useConverterStore((s) => s.file);
  const previewUrl = useConverterStore((s) => s.previewUrl);
  const inputKind = useConverterStore((s) => s.inputKind);
  const busy = useConverterStore(selectBusy);
  const selectFile = useConverterStore((s) => s.selectFile);
  const selectFiles = useConverterStore((s) => s.selectFiles);
  const queued = useConverterStore((s) => s.queued.length);
  const resetPlayback = usePlaybackStore((s) => s.reset);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const KindIcon = inputKind === "gif" ? GifIcon : inputKind === "image" ? ImageIcon : VideoIcon;
  const choose = (next: File | null) => {
    resetPlayback();
    const error = selectFile(next);
    if (error) notify.error(error);
  };
  /** One or several (up to MAX_BATCH): the rest wait and go after this one. */
  const chooseMany = (files: File[]) => {
    if (files.length <= 1) return choose(files[0] ?? null);
    resetPlayback();
    const refused = selectFiles(files);
    if (refused > 0) notify.warning(`${refused} ${refused === 1 ? "archivo no se pudo usar" : "archivos no se pudieron usar"}.`);
  };

  // Ctrl/⌘+V anywhere on the page: a screenshot, a copied image or a file copied on disk.
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      if (!wantsMediaPaste(e.target, e.clipboardData)) return;
      const files = mediaFromPaste(e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      applyPaste(files);
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, []);
  // Phones have no Ctrl+V: a «Pegar» button reads the clipboard on tap.
  const [canPaste] = useState(canReadClipboard);
  const pasteFromButton = async () => {
    const r = await readClipboardMedia();
    if ("error" in r) return void notify.error(r.error, { id: "paste-error" });
    applyPaste(r.files);
  };

  const picker = (
    <input
      ref={inputRef}
      type="file"
      accept="video/*,image/*"
      multiple
      className="hidden"
      onChange={(e) => {
        const picked = [...(e.target.files ?? [])];
        if (picked.length) chooseMany(picked);
        e.target.value = "";
      }}
    />
  );

  return (
    <AnimatePresence mode="wait" initial={false}>
      {file && previewUrl && inputKind ? (
        <m.div
          key="preview"
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.985 }}
          transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
          className="relative space-y-3"
          // Dropping another file on the preview replaces the clip (no need to find the button).
          onDragOver={(e: DragEvent) => {
            if (busy) return;
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e: DragEvent) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={(e: DragEvent) => {
            e.preventDefault();
            setDragging(false);
            const dropped = [...e.dataTransfer.files];
            if (dropped.length && !busy) chooseMany(dropped);
          }}
        >
          {inputKind === "video" ? (
            <VideoEditor url={previewUrl} />
          ) : (
            <div className="overflow-hidden rounded-2xl bg-black">
              <SourceImage url={previewUrl} name={file.name} />
            </div>
          )}
          <div className="flex items-center gap-3 rounded-2xl bg-muted/50 p-2 pr-2.5 ring-1 ring-border/50">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-background text-muted-foreground ring-1 ring-border/60" aria-hidden>
              <KindIcon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium" title={file.name}>
                {file.name}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {KIND_LABEL[inputKind]} · {formatBytes(file.size)}
                {queued > 0 && <span className="font-medium text-sound"> · +{queued} en fila</span>}
              </p>
            </div>
            <Button
              variant="secondary"
              className="h-9 shrink-0 rounded-full px-3.5"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              title={`Elegir otro video, GIF o imagen (o arrástralo encima, o pégalo con ${PASTE_KEY})`}
            >
              <SwapIcon className="size-4" />
              <span>
                Cambiar<span className="hidden sm:inline"> clip</span>
              </span>
            </Button>
            <Button variant="ghost" size="icon-sm" className="shrink-0 rounded-full" disabled={busy} onClick={() => choose(null)} aria-label="Quitar archivo" title="Quitar">
              <XIcon />
            </Button>
          </div>
          {dragging && (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-2xl bg-background/80 shadow-[inset_0_0_0_2px_var(--sound)] backdrop-blur-sm">
              <p className="flex items-center gap-2 text-[15px] font-semibold">
                <SwapIcon className="size-5 text-sound" /> Suelta para cambiar el clip
              </p>
            </div>
          )}
          {picker}
        </m.div>
      ) : (
        <m.div
          key="empty"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onDragOver={(e: DragEvent) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e: DragEvent) => {
            e.preventDefault();
            setDragging(false);
            const dropped = [...e.dataTransfer.files];
            if (dropped.length && !busy) chooseMany(dropped);
          }}
          className={cn(
            "flex h-[clamp(16rem,42vh,26rem)] w-full flex-col items-center justify-center gap-5 rounded-2xl bg-stage px-6 text-center transition-[box-shadow,background-color]",
            dragging && "bg-sound-soft shadow-[inset_0_0_0_2px_var(--sound)]",
          )}
        >
          <m.button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            animate={{ scale: dragging ? 1.08 : 1 }}
            aria-label="Elegir archivo"
            className="grid size-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/10 focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none"
          >
            <PlusIcon className="size-7" />
          </m.button>
          <div className="space-y-1.5">
            <p className="text-lg font-semibold tracking-tight">{dragging ? "Suéltalo aquí" : "Elige un clip"}</p>
            <p className="text-sm text-muted-foreground">
              Video, GIF o imagen · arrástralo, haz clic
              <span className="pointer-coarse:hidden"> o pégalo ({PASTE_KEY})</span> · hasta 50 MB
            </p>
          </div>
          {canPaste && (
            <Button variant="secondary" className="h-10 rounded-full px-4" disabled={busy} onClick={() => void pasteFromButton()}>
              <PasteIcon className="size-4" />
              Pegar imagen copiada
            </Button>
          )}
          {picker}
        </m.div>
      )}
    </AnimatePresence>
  );
}

/** A paste becomes the clip (several → the rest wait in line), unless a conversion is running. */
function applyPaste(files: File[]): void {
  const store = useConverterStore.getState();
  if (selectBusy(store)) return void notify.info("Espera a que termine para pegar otro clip.", { id: "paste" });
  usePlaybackStore.getState().reset();
  if (files.length > 1) {
    const refused = store.selectFiles(files);
    if (refused > 0) notify.warning(`${refused} ${refused === 1 ? "archivo no se pudo usar" : "archivos no se pudieron usar"}.`);
  } else {
    const error = store.selectFile(files[0] ?? null);
    if (error) return void notify.error(error);
  }
  if (useConverterStore.getState().file) notify.success("Clip pegado", { id: "paste" });
}

function SourceImage({ url, name }: { url: string; name: string }) {
  return (
    <div className="checkerboard flex aspect-video w-full items-center justify-center">
      <img src={url} alt={name} className="max-h-full max-w-full object-contain" />
    </div>
  );
}
