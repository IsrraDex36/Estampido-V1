import { FileVideoIcon, UploadIcon, XIcon } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

interface VideoDropzoneProps {
  file: File | null;
  previewUrl: string | null;
  disabled?: boolean;
  onSelect: (file: File | null) => void;
  /** Reports current playhead so the user can pick a start time. */
  onTimeUpdate?: (sec: number) => void;
  onDurationChange?: (sec: number) => void;
}

export function VideoDropzone({
  file,
  previewUrl,
  disabled,
  onSelect,
  onTimeUpdate,
  onDurationChange,
}: VideoDropzoneProps) {
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
    return (
      <div className="space-y-2">
        {/* biome-ignore lint/a11y/useMediaCaption: user-supplied preview */}
        <video
          src={previewUrl}
          controls
          playsInline
          className="aspect-video w-full rounded-lg bg-black object-contain"
          onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => onDurationChange?.(e.currentTarget.duration)}
        />
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span className="flex min-w-0 items-center gap-2">
            <FileVideoIcon className="size-4 shrink-0" />
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
        <p className="font-medium">Arrastra un video o haz clic para elegir</p>
        <p className="text-sm text-muted-foreground">MP4, MOV, WebM · máx. 50 MB</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
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
