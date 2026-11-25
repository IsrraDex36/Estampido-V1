import { API_LIMITS } from "@contract";
import { ArrowRightToLineIcon, SparklesIcon, TimerIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { TimeInput } from "@/components/time-input";
import { formatTime, presetLabel, smoothnessFor } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { ConverterOptions, InputKind } from "../types";

const DEFAULT_SEC = 5;
const VIDEO_PRESETS = [3, 5, 10, 30, 60, 120, 180];
const IMAGE_PRESETS = [3, 5, 10];

interface SegmentControlsProps {
  options: ConverterOptions;
  inputKind: InputKind;
  disabled?: boolean;
  /** Preview playhead (video only). */
  currentTime?: number;
  /** Source length if the browser knows it (video only). */
  sourceDuration?: number;
  onChange: (patch: Partial<ConverterOptions>) => void;
}

/**
 * Start / duration UI. Video: range slider over the clip + m:ss inputs +
 * presets. GIF: sound length (the animation loops). Image: sound length or auto.
 */
export function SegmentControls({
  options,
  inputKind,
  disabled,
  currentTime,
  sourceDuration,
  onChange,
}: SegmentControlsProps) {
  const isImage = inputKind === "image";
  const isVideo = inputKind === "video";
  const maxDuration = isImage ? API_LIMITS.maxImageAudioSec : API_LIMITS.maxDurationSec;
  const minDuration = API_LIMITS.minDurationSec;

  const known = isVideo && sourceDuration !== undefined && Number.isFinite(sourceDuration) && sourceDuration > 0;
  const start = isImage ? 0 : options.startSec;
  const remaining = known ? Math.max(0, (sourceDuration as number) - start) : Number.POSITIVE_INFINITY;
  const requested = options.durationSec ?? (isImage ? undefined : DEFAULT_SEC);
  const effective = requested === undefined ? undefined : Math.min(requested, remaining);
  const end = effective === undefined ? undefined : start + effective;
  const presets = (isImage ? IMAGE_PRESETS : VIDEO_PRESETS).filter((p) => p <= maxDuration);
  const smooth = isVideo && effective !== undefined ? smoothnessFor(effective, options.hq ?? false) : "fluid";

  const setDuration = (d: number | undefined) =>
    onChange({ durationSec: d === undefined ? undefined : Math.min(maxDuration, Math.max(minDuration, d)) });

  /** Two-thumb slider → start/duration, keeping the span within limits. */
  const onRange = ([s = 0, e = 0]: number[]) => {
    let nextStart = s;
    let nextEnd = e;
    if (nextEnd - nextStart > maxDuration) {
      // Keep the thumb the user is dragging; pull the other one along.
      if (nextStart !== start) nextEnd = nextStart + maxDuration;
      else nextStart = nextEnd - maxDuration;
    }
    if (nextEnd - nextStart < minDuration) nextEnd = nextStart + minDuration;
    onChange({ startSec: round1(nextStart), durationSec: round1(nextEnd - nextStart) });
  };

  return (
    <div className="space-y-4 rounded-lg border p-3 sm:col-span-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-sm font-medium">
          {isVideo ? "Segmento del video" : isImage ? "Duración del sonido" : "Duración del sonido (el GIF se repite)"}
        </Label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {isVideo && end !== undefined
            ? `${formatTime(start)} → ${formatTime(end)} · ${formatTime(effective as number)}`
            : effective !== undefined
              ? formatTime(effective)
              : `auto (hasta ${maxDuration} s)`}
        </span>
      </div>

      {known && end !== undefined && (
        <div className="space-y-1">
          <Slider
            min={0}
            max={round1(sourceDuration as number)}
            step={0.1}
            minStepsBetweenThumbs={Math.round(minDuration * 10)}
            value={[start, end]}
            disabled={disabled}
            onValueChange={onRange}
            aria-label="Inicio y fin del segmento"
          />
          <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground">
            <span>0:00</span>
            <span>{formatTime(sourceDuration as number)}</span>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {!isImage && (
          <div className="space-y-1.5">
            <Label htmlFor="start" className="text-xs text-muted-foreground">
              Inicio (m:ss)
            </Label>
            <div className="flex gap-2">
              <TimeInput
                id="start"
                value={start}
                min={0}
                max={known ? Math.max(0, (sourceDuration as number) - minDuration) : undefined}
                disabled={disabled}
                onValueChange={(v) => onChange({ startSec: v ?? 0 })}
              />
              <Button
                type="button"
                variant="outline"
                disabled={disabled || currentTime === undefined || !isVideo}
                title="Usar el punto actual del video"
                onClick={() => currentTime !== undefined && onChange({ startSec: round1(currentTime) })}
              >
                <TimerIcon data-icon="inline-start" />
                Actual
              </Button>
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="duration" className="text-xs text-muted-foreground">
            Duración (m:ss, máx. {presetLabel(maxDuration)})
          </Label>
          <TimeInput
            id="duration"
            value={options.durationSec}
            min={minDuration}
            max={maxDuration}
            allowEmpty={isImage}
            placeholder={isImage ? "auto" : formatTime(DEFAULT_SEC)}
            disabled={disabled}
            onValueChange={setDuration}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {isImage && (
          <PresetChip active={options.durationSec === undefined} disabled={disabled} onClick={() => setDuration(undefined)}>
            Auto
          </PresetChip>
        )}
        {presets.map((p) => (
          <PresetChip
            key={p}
            active={effective === p || (requested === p && effective !== undefined && effective < p)}
            disabled={disabled || (known && p > remaining + 0.05)}
            onClick={() => setDuration(p)}
          >
            {presetLabel(p)}
          </PresetChip>
        ))}
        {known && (
          <PresetChip
            active={effective !== undefined && Math.abs(effective - Math.min(maxDuration, remaining)) < 0.05}
            disabled={disabled}
            onClick={() => setDuration(round1(Math.min(maxDuration, remaining)))}
          >
            <ArrowRightToLineIcon className="size-3" />
            Hasta el final
          </PresetChip>
        )}
      </div>

      {requested !== undefined && effective !== undefined && effective < requested - 0.05 && (
        <p className="text-xs text-muted-foreground">
          El video termina antes: se usarán {formatTime(effective)} en vez de {formatTime(requested)}.
        </p>
      )}

      {smooth !== "fluid" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/60 p-2 text-xs">
          <span className="flex items-center gap-1.5">
            <TriangleAlertIcon className="size-3.5 shrink-0" />
            {smooth === "reduced"
              ? "Clip largo: para entrar en el límite perderá fluidez."
              : "Muy largo: quedará casi como diapositivas (≈ 1 imagen por segundo o menos). El audio se mantiene completo."}
          </span>
          {!options.hq && (
            <Button type="button" variant="outline" size="xs" disabled={disabled} onClick={() => onChange({ hq: true })}>
              <SparklesIcon data-icon="inline-start" />
              Activar calidad alta
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function PresetChip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant={active ? "default" : "outline"}
      disabled={disabled}
      onClick={onClick}
      className={cn("rounded-full tabular-nums")}
      aria-pressed={active}
    >
      {children}
    </Button>
  );
}
