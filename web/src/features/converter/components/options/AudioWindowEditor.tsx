import { useEffect, useRef } from "react";
import { PauseIcon, PlayIcon } from "@/components/icons";
import { TimeInput } from "@/components/time-input";
import { Button } from "@/components/ui/button";
import { useAudioPeaks } from "../../hooks/useAudioPeaks";
import { useAudioPreview } from "../../hooks/useAudioPreview";
import { clipWindow, maxStartFor } from "../../model/audioWindow";
import type { Span } from "../../model/trim";
import { Trimmer, WaveStrip } from "../trim/Trimmer";

const BARS = 64;

export interface AudioWindowChange {
  audioStartSec: number;
  durationSec?: number;
}

/**
 * Same editor as the video: the sound's waveform with a white frame over the
 * stretch that plays. Videos/GIFs fix its length (the frame only slides);
 * images let the grips set it. ▶ listens to it.
 */
export function AudioWindowEditor({
  file,
  start,
  wanted,
  minSec,
  maxSec,
  resizable,
  disabled,
  onChange,
}: {
  file: File;
  start: number;
  /** Seconds the sticker plays; undefined = auto (to the end, up to maxSec). */
  wanted: number | undefined;
  minSec: number;
  maxSec: number;
  resizable: boolean;
  disabled?: boolean;
  onChange: (change: AudioWindowChange) => void;
}) {
  const peaks = useAudioPeaks(file, BARS);
  const preview = useAudioPreview(file);
  const playheadRef = useRef<HTMLSpanElement>(null);
  const total = peaks.kind === "ready" ? peaks.duration : 0;
  const win = clipWindow(total, start, wanted, maxSec);
  const span: Span = { start: win.start, end: Math.round((win.start + win.length) * 10) / 10 };

  useEffect(() => {
    const el = playheadRef.current;
    if (!el) return;
    el.style.opacity = preview.position === null ? "0" : "1";
    if (preview.position !== null && total > 0) el.style.left = `${(preview.position / total) * 100}%`;
  }, [preview.position, total]);

  const change = (next: Span) => {
    if (preview.playing) preview.stop();
    onChange(
      resizable
        ? { audioStartSec: next.start, durationSec: Math.round((next.end - next.start) * 10) / 10 }
        : { audioStartSec: next.start },
    );
  };

  const playButton = (
    <Button
      type="button"
      size="icon"
      className="size-8 shrink-0 rounded-full bg-sound text-background hover:bg-sound/90"
      disabled={peaks.kind === "loading" || disabled}
      aria-label={preview.playing ? "Detener" : "Escuchar el tramo que sonará"}
      onClick={() =>
        preview.playing
          ? preview.stop()
          : total > 0
            ? preview.play(win.start, win.length)
            : preview.play(start, wanted ?? maxSec)
      }
    >
      {preview.playing ? <PauseIcon weight="fill" /> : <PlayIcon weight="fill" />}
    </Button>
  );

  return (
    <div className="space-y-3">
      {peaks.kind === "ready" && win.length > 0 ? (
        <Trimmer
          strip={<WaveStrip peaks={peaks.peaks} />}
          resizable={resizable}
          label={resizable ? "Tramo del sonido: arrastra los bordes o el marco" : "Tramo del sonido: arrastra el marco"}
          headerExtra={playButton}
          span={span}
          limits={{ total, min: Math.min(minSec, total), max: resizable ? Math.min(maxSec, total) : win.length }}
          disabled={disabled}
          playheadRef={playheadRef}
          onChange={change}
          onScrub={() => {}}
          onDragging={(on) => on && preview.playing && preview.stop()}
        />
      ) : (
        <div className="flex items-center gap-3">
          {playButton}
          <WaveformFallback loading={peaks.kind === "loading" || peaks.kind === "idle"} />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[13px] text-muted-foreground">
        <span>{resizable ? "Arrastra los bordes para cambiar cuánto suena." : "Arrastra el marco para elegir qué parte suena."}</span>
        <label className="flex items-center gap-2" htmlFor="audio-start">
          Empieza en
          <TimeInput
            id="audio-start"
            className="h-9 w-24"
            value={start}
            min={0}
            max={total > 0 ? maxStartFor(total, wanted) : undefined}
            disabled={disabled}
            onValueChange={(v) => {
              if (preview.playing) preview.stop();
              onChange({ audioStartSec: v ?? 0 });
            }}
          />
        </label>
      </div>
    </div>
  );
}

function WaveformFallback({ loading }: { loading: boolean }) {
  return (
    <div className="flex h-14 min-w-0 flex-1 items-center rounded-xl bg-foreground/5 px-3 text-[13px] text-muted-foreground">
      {loading ? (
        <span className="flex h-6 w-full items-center gap-[3px]" aria-label="Leyendo el sonido…">
          {Array.from({ length: 24 }, (_, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: decorative skeleton bars
              key={i}
              className="h-full flex-1 animate-pulse rounded-full bg-foreground/10 motion-reduce:animate-none"
              style={{ height: `${30 + ((i * 37) % 60)}%` }}
            />
          ))}
        </span>
      ) : (
        "No se pudo dibujar la onda; igual puedes escucharlo y elegir dónde empieza."
      )}
    </div>
  );
}
