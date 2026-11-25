import { FileImageIcon, FileVideoIcon, UploadCloudIcon, XIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type DragEvent, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { inputKindOf } from "../types";

interface MediaDropzoneProps {
  file: File | null;
  previewUrl: string | null;
  disabled?: boolean;
  onSelect: (file: File | null) => void;
  /** Reports current playhead so the user can pick a start time. */
  onTimeUpdate?: (sec: number) => void;
  onDurationChange?: (sec: number) => void;
  /** Jump the preview here when it changes (segment start). */
  seekTo?: number;
}

const FORMATS = ["MP4", "MOV", "WebM", "GIF", "PNG", "JPG", "WebP"];
const KIND_LABEL = { video: "Video", gif: "GIF", image: "Imagen" } as const;

export function MediaDropzone({
  file,
  previewUrl,
  disabled,
  onSelect,
  onTimeUpdate,
  onDurationChange,
  seekTo,
}: MediaDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (v && seekTo !== undefined && Math.abs(v.currentTime - seekTo) > 0.25) v.currentTime = seekTo;
  }, [seekTo]);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const dropped = e.dataTransfer.files[0];
    if (dropped) onSelect(dropped);
  };

  const picker = (
    <input
      ref={inputRef}
      type="file"
      accept="video/*,image/*"
      className="hidden"
      onChange={(e) => {
        const picked = e.target.files?.[0];
        if (picked) onSelect(picked);
        e.target.value = "";
      }}
    />
  );

  return (
    <AnimatePresence mode="wait" initial={false}>
      {file && previewUrl ? (
        <motion.div
          key="preview"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          className="space-y-2.5"
        >
          <div className="overflow-hidden rounded-xl border bg-black shadow-sm">
            {inputKindOf(file) === "video" ? (
              // biome-ignore lint/a11y/useMediaCaption: user-supplied preview
              <video
                ref={videoRef}
                src={previewUrl}
                controls
                playsInline
                className="aspect-video w-full object-contain"
                onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => onDurationChange?.(e.currentTarget.duration)}
              />
            ) : (
              <div className="checkerboard flex aspect-video w-full items-center justify-center">
                <img src={previewUrl} alt={file.name} className="max-h-full max-w-full object-contain" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            {inputKindOf(file) === "video" ? (
              <FileVideoIcon className="size-4 shrink-0 text-primary" />
            ) : (
              <FileImageIcon className="size-4 shrink-0 text-primary" />
            )}
            <span className="min-w-0 truncate font-medium">{file.name}</span>
            <Badge variant="secondary" className="shrink-0">
              {KIND_LABEL[inputKindOf(file)]} · {formatBytes(file.size)}
            </Badge>
            <div className="ml-auto flex shrink-0 gap-1">
              <Button variant="ghost" size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
                Cambiar
              </Button>
              <Button variant="ghost" size="icon-sm" disabled={disabled} onClick={() => onSelect(null)} aria-label="Quitar">
                <XIcon />
              </Button>
            </div>
          </div>
          {picker}
        </motion.div>
      ) : (
        <motion.button
          key="empty"
          type="button"
          disabled={disabled}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, scale: dragging ? 1.015 : 1 }}
          exit={{ opacity: 0 }}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "group flex w-full flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors",
            "hover:border-primary/50 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            dragging && "border-primary bg-accent/60",
          )}
        >
          <motion.span
            animate={{ y: dragging ? -4 : 0 }}
            className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:scale-105"
          >
            <UploadCloudIcon className="size-7" />
          </motion.span>
          <span className="space-y-1">
            <span className="block text-base font-semibold">
              {dragging ? "Suelta para cargar" : "Arrastra un video, GIF o imagen"}
            </span>
            <span className="block text-sm text-muted-foreground">o haz clic para elegir · máx. 50 MB</span>
          </span>
          <span className="flex flex-wrap justify-center gap-1">
            {FORMATS.map((f) => (
              <span key={f} className="rounded-md border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {f}
              </span>
            ))}
          </span>
          {picker}
        </motion.button>
      )}
    </AnimatePresence>
  );
}
