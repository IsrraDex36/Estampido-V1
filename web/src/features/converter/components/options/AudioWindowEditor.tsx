import { type KeyboardEvent, type PointerEvent, useRef } from "react";
import { PauseIcon, PlayIcon } from "@/components/icons";
import { TimeInput } from "@/components/time-input";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useAudioPeaks } from "../../hooks/useAudioPeaks";
import { useAudioPreview } from "../../hooks/useAudioPreview";
import { clipWindow, maxStartFor, startFromPointer } from "../../model/audioWindow";

const BARS = 64;

/**
 * Waveform of the chosen sound with the stretch that will play highlighted.
 * Tap/drag the waveform (or use the arrows) to move it; ▶ listens to it.
 */
export function AudioWindowEditor({
  file,
  start,
  wanted,
  maxSec,
  disabled,
  onStart,
}: {
  file: File;
  start: number;
  /** Seconds the sticker plays; undefined = auto (to the end, up to maxSec). */
  wanted: number | undefined;
  maxSec: number;
  disabled?: boolean;
  onStart: (sec: number) => void;
}) {
  const peaks = useAudioPeaks(file, BARS);
  const preview = useAudioPreview(file);
  const trackRef = useRef<HTMLDivElement>(null);
  const total = peaks.kind === "ready" ? peaks.duration : 0;
  const win = clipWindow(total, start, wanted, maxSec);
  const maxStart = maxStartFor(total, wanted);

  const move = (sec: number) => {
    if (preview.playing) preview.stop();
    onStart(sec);
  };
  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || total === 0) return;
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    move(startFromPointer(ratio * total, total, wanted));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 1 : 0.1;
    const next =
      e.key === "ArrowLeft" || e.key === "ArrowDown"
        ? win.start - step
        : e.key === "ArrowRight" || e.key === "ArrowUp"
          ? win.start + step
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? maxStart
              : null;
    if (next === null) return;
    e.preventDefault();
    move(Math.round(Math.min(maxStart, Math.max(0, next)) * 10) / 10);
  };

  const left = total > 0 ? (win.start / total) * 100 : 0;
  const width = total > 0 ? (win.length / total) * 100 : 100;
  const head = preview.position !== null && total > 0 ? (preview.position / total) * 100 : null;
  const canPlay = peaks.kind !== "loading" && !disabled;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="icon"
          className="size-11 shrink-0 rounded-full bg-sound text-background hover:bg-sound/90"
          disabled={!canPlay}
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

        {peaks.kind === "ready" ? (
          <div
            ref={trackRef}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label="Tramo del sonido"
            aria-valuemin={0}
            aria-valuemax={maxStart}
            aria-valuenow={win.start}
            aria-valuetext={`De ${formatTime(win.start)} a ${formatTime(win.start + win.length)}`}
            aria-disabled={disabled}
            onKeyDown={disabled ? undefined : onKey}
            onPointerDown={(e) => {
              if (disabled) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              fromPointer(e);
            }}
            onPointerMove={(e) => {
              if (!disabled && e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
            }}
            className={cn(
              "relative h-14 min-w-0 flex-1 touch-none rounded-xl outline-none select-none focus-visible:ring-2 focus-visible:ring-ring",
              disabled ? "opacity-60" : "cursor-grab active:cursor-grabbing",
            )}
          >
            <span
              className="absolute inset-y-0 rounded-lg bg-sound-soft shadow-[inset_0_0_0_1.5px_var(--sound)] transition-[left] duration-75"
              style={{ left: `${left}%`, width: `${width}%` }}
              aria-hidden
            />
            <span className="absolute inset-0 flex items-center gap-[2px] px-0.5" aria-hidden>
              {peaks.peaks.map((p, i) => {
                const at = ((i + 0.5) / BARS) * 100;
                const inside = at >= left && at <= left + width;
                return (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed bars of one decoded file
                    key={i}
                    className={cn("flex-1 rounded-full", inside ? "bg-sound" : "bg-foreground/20")}
                    style={{ height: `${Math.max(8, Math.round(p * 86))}%` }}
                  />
                );
              })}
            </span>
            {head !== null && (
              <span className="absolute inset-y-0 w-0.5 rounded-full bg-foreground" style={{ left: `${head}%` }} aria-hidden />
            )}
          </div>
        ) : (
          <WaveformFallback loading={peaks.kind === "loading" || peaks.kind === "idle"} />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[13px] text-muted-foreground">
        <span className="font-mono tabular-nums">
          {total > 0 ? (
            <>
              Suena <span className="text-foreground">{formatTime(win.start)} – {formatTime(win.start + win.length)}</span> de{" "}
              {formatTime(total)}
            </>
          ) : (
            "Arrastra sobre la onda para elegir el tramo."
          )}
        </span>
        <label className="flex items-center gap-2" htmlFor="audio-start">
          Empieza en
          <TimeInput
            id="audio-start"
            className="h-9 w-24"
            value={start}
            min={0}
            max={total > 0 ? maxStart : undefined}
            disabled={disabled}
            onValueChange={(v) => move(v ?? 0)}
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
