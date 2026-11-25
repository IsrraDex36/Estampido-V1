import { MicIcon, SquareIcon, XIcon } from "lucide-react";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { useVoiceRecorder } from "../../hooks/useVoiceRecorder";

type Recorder = ReturnType<typeof useVoiceRecorder>;

/** Mic button (idle) — used next to «Elegir audio…». */
export function RecordButton({ recorder, disabled }: { recorder: Recorder; disabled?: boolean }) {
  const requesting = recorder.state.kind === "requesting";
  return (
    <Button
      variant="secondary"
      size="sm"
      className="rounded-full"
      disabled={disabled || requesting}
      onClick={() => void recorder.start()}
    >
      <MicIcon data-icon="inline-start" />
      {requesting ? "Permiso…" : "Grabar"}
    </Button>
  );
}

const BARS = 24;

/** Live recording panel: pulsing dot, timer / limit, level meter, stop & discard. */
export function RecordingPanel({ recorder, maxSec }: { recorder: Recorder; maxSec: number }) {
  if (recorder.state.kind !== "recording") return null;
  const { elapsed, level } = recorder.state;
  const progress = Math.min(1, elapsed / maxSec);
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-muted/60 px-4 py-3" role="status" aria-live="polite">
      <span className="relative flex size-2.5 shrink-0" aria-hidden>
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-retro-a opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex size-2.5 rounded-full bg-retro-a" />
      </span>
      <span className="shrink-0 font-mono text-[13px] whitespace-nowrap tabular-nums">
        {formatTime(elapsed)} <span className="text-muted-foreground">/ {formatTime(maxSec)}</span>
      </span>
      <div className="flex h-6 min-w-0 flex-1 items-center gap-[3px]" aria-hidden>
        {Array.from({ length: BARS }, (_, i) => {
          const lit = i / BARS < progress;
          const h = lit ? 0.25 + level * (0.75 - Math.abs(i - BARS / 2) / BARS) : 0.18;
          return (
            <span
              key={`b${i + 1}`}
              className={cn("flex-1 rounded-full transition-[height] duration-75", lit ? "bg-sound" : "bg-foreground/10")}
              style={{ height: `${Math.max(12, Math.round(h * 100))}%` }}
            />
          );
        })}
      </div>
      <Button size="sm" className="rounded-full" onClick={recorder.stop}>
        <SquareIcon data-icon="inline-start" className="fill-current" />
        Listo
      </Button>
      <Button size="icon" variant="ghost" className="size-8 rounded-full" aria-label="Descartar grabación" onClick={recorder.cancel}>
        <XIcon />
      </Button>
    </div>
  );
}
