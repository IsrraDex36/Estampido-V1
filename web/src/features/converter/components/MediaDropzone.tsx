import { FileImageIcon, FileVideoIcon, UploadIcon, XIcon } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
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
}

export function MediaDropzone({
  file,
  previewUrl,
  disabled,
  onSelect,
  onTimeUpdate,
  onDurationChange,
}: MediaDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const dropped = e.dataTransfer.files[0];
    if (dropped) onSelect(dropped);
  };

  if (file && previewUrl) {
    const isVideo = inputKindOf(file) === "video";
    const Icon = isVideo ? FileVideoIcon : FileImageIcon;
    return (
      <div className="space-y-2">
        {isVideo ? (
          // biome-ignore lint/a11y/useMediaCaption: user-supplied preview
          <video
          src={previewUrl}
          controls
          playsInline
          className="aspect-video w-full rounded-lg bg-black object-contain"
          onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => onDurationChange?.(e.currentTarget.duration)}
          />
        ) : (
          <div className="checkerboard flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg">
            <img src={previewUrl} alt={file.name} className="max-h-full max-w-full object-contain" />
          </div>
        )}
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span className="flex min-w-0 items-center gap-2">
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{file.name}</span>
            <span className="shrink-0">· {formatBytes(file.size)}</span>
          </span>
          <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onSelect(null)}>
            <XIcon data-icon="inline-start" />
            Quitar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
        "hover:border-primary/50 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        dragging && "border-primary bg-muted",
      )}
    >
      <UploadIcon className="size-8 text-muted-foreground" />
      <div>
        <p className="font-medium">Arrastra un video, GIF o imagen, o haz clic para elegir</p>
        <p className="text-sm text-muted-foreground">MP4, MOV, WebM, GIF, PNG, JPG, WebP · máx. 50 MB</p>
      </div>
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
    </button>
  );
}
