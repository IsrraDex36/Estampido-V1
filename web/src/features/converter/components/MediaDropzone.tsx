import { PlusIcon, XIcon } from "lucide-react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { type DragEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { selectBusy, useConverterStore } from "../store/converterStore";
import { usePlaybackStore } from "../store/playbackStore";

const KIND_LABEL = { video: "Video", gif: "GIF", image: "Imagen" } as const;

/** Pick / drop the source clip, then preview it. Reads & writes the stores directly. */
export function MediaDropzone() {
  const file = useConverterStore((s) => s.file);
  const previewUrl = useConverterStore((s) => s.previewUrl);
  const inputKind = useConverterStore((s) => s.inputKind);
  const busy = useConverterStore(selectBusy);
  const selectFile = useConverterStore((s) => s.selectFile);
  const resetPlayback = usePlaybackStore((s) => s.reset);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const choose = (next: File | null) => {
    resetPlayback();
    const error = selectFile(next);
    if (error) toast.error(error);
  };

  const picker = (
    <input
      ref={inputRef}
      type="file"
      accept="video/*,image/*"
      className="hidden"
      onChange={(e) => {
        const picked = e.target.files?.[0];
        if (picked) choose(picked);
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
          className="space-y-3"
        >
          <div className="overflow-hidden rounded-2xl bg-black">
            {inputKind === "video" ? <SourceVideo url={previewUrl} /> : <SourceImage url={previewUrl} name={file.name} />}
          </div>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium">{file.name}</p>
              <p className="text-[13px] text-muted-foreground">
                {KIND_LABEL[inputKind]} · {formatBytes(file.size)}
              </p>
            </div>
            <Button variant="secondary" size="sm" className="rounded-full" disabled={busy} onClick={() => inputRef.current?.click()}>
              Cambiar
            </Button>
            <Button variant="ghost" size="icon-sm" className="rounded-full" disabled={busy} onClick={() => choose(null)} aria-label="Quitar archivo">
              <XIcon />
            </Button>
          </div>
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
            const dropped = e.dataTransfer.files[0];
            if (dropped && !busy) choose(dropped);
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
            <p className="text-sm text-muted-foreground">Video, GIF o imagen · arrástralo o haz clic · hasta 50 MB</p>
          </div>
          {picker}
        </m.div>
      )}
    </AnimatePresence>
  );
}

/** Video preview wired to the playback store; seeks when the segment start changes. */
function SourceVideo({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const startSec = useConverterStore((s) => s.options.startSec);
  const setCurrentTime = usePlaybackStore((s) => s.setCurrentTime);
  const setDuration = usePlaybackStore((s) => s.setDuration);

  useEffect(() => {
    const v = ref.current;
    if (v && Math.abs(v.currentTime - startSec) > 0.25) v.currentTime = startSec;
  }, [startSec]);

  return (
    // biome-ignore lint/a11y/useMediaCaption: user-supplied preview
    <video
      ref={ref}
      src={url}
      controls
      playsInline
      className="aspect-video w-full object-contain"
      onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
      onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
    />
  );
}

function SourceImage({ url, name }: { url: string; name: string }) {
  return (
    <div className="checkerboard flex aspect-video w-full items-center justify-center">
      <img src={url} alt={name} className="max-h-full max-w-full object-contain" />
    </div>
  );
}
