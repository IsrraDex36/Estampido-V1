import { ArrowRightToLineIcon, TimerIcon } from "lucide-react";
import { TimeInput } from "@/components/time-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { formatTime, presetLabel } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useConverterStore } from "../../store/converterStore";
import { usePlaybackStore } from "../../store/playbackStore";
import { useSegment } from "./useSegment";

/** Start/duration editor: range over the clip, m:ss fields, presets, hints. */
export function SegmentControls() {
  const seg = useSegment();
  return (
    <div className="space-y-5">
      <Summary />
      {seg.known && seg.end !== undefined && <Range />}
      <div className="grid gap-3 sm:grid-cols-2">
        {!seg.isImage && <StartField />}
        <DurationField />
      </div>
      <Presets />
      <Notes />
    </div>
  );
}

function Summary() {
  const { isVideo, isImage, start, end, effective, maxDuration } = useSegment();
  return (
    <div className="flex items-baseline justify-between gap-3">
      <p className="text-[15px] font-medium">
        {isVideo ? "Tramo del video" : isImage ? "Duración del sonido" : "Duración del sonido"}
      </p>
      <p className="font-mono text-[13px] tabular-nums text-muted-foreground">
        {isVideo && end !== undefined
          ? `${formatTime(start)} – ${formatTime(end)}`
          : effective !== undefined
            ? formatTime(effective)
            : `auto · hasta ${maxDuration} s`}
      </p>
    </div>
  );
}

function Range() {
  const { start, end, sourceDuration, minDuration, disabled, setRange } = useSegment();
  return (
    <div className="space-y-1.5">
      <Slider
        min={0}
        max={Math.round(sourceDuration * 10) / 10}
        step={0.1}
        minStepsBetweenThumbs={Math.round(minDuration * 10)}
        value={[start, end as number]}
        disabled={disabled}
        onValueChange={setRange}
        aria-label="Inicio y fin del tramo"
      />
      <div className="flex justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
        <span>0:00</span>
        <span>{formatTime(sourceDuration)}</span>
      </div>
    </div>
  );
}

function StartField() {
  const { start, known, sourceDuration, minDuration, disabled, setStart } = useSegment();
  return (
    <div className="space-y-1.5">
      <Label htmlFor="start" className="text-[13px] text-muted-foreground">
        Inicio
      </Label>
      <div className="flex gap-2">
        <TimeInput
          id="start"
          value={start}
          min={0}
          max={known ? Math.max(0, sourceDuration - minDuration) : undefined}
          disabled={disabled}
          onValueChange={(v) => setStart(v ?? 0)}
        />
        <UseCurrentTime />
      </div>
    </div>
  );
}

/** Only this button subscribes to the (high-frequency) playhead. */
function UseCurrentTime() {
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const isVideo = useConverterStore((s) => s.inputKind === "video");
  const { disabled, setStart } = useSegment();
  return (
    <Button
      type="button"
      variant="secondary"
      className="shrink-0"
      disabled={disabled || currentTime === undefined || !isVideo}
      title="Usar el punto actual del video"
      onClick={() => currentTime !== undefined && setStart(currentTime)}
    >
      <TimerIcon data-icon="inline-start" />
      Actual
    </Button>
  );
}

function DurationField() {
  const { isImage, maxDuration, minDuration, disabled, setDuration } = useSegment();
  const durationSec = useConverterStore((s) => s.options.durationSec);
  return (
    <div className="space-y-1.5">
      <Label htmlFor="duration" className="text-[13px] text-muted-foreground">
        Duración · máx. {presetLabel(maxDuration)}
      </Label>
      <TimeInput
        id="duration"
        value={durationSec}
        min={minDuration}
        max={maxDuration}
        allowEmpty={isImage}
        placeholder={isImage ? "auto" : "0:05"}
        disabled={disabled}
        onValueChange={setDuration}
      />
    </div>
  );
}

function Presets() {
  const { isImage, presets, known, remaining, effective, requested, maxDuration, disabled, setDuration } = useSegment();
  const durationSec = useConverterStore((s) => s.options.durationSec);
  const untilEnd = Math.round(Math.min(maxDuration, remaining) * 10) / 10;
  return (
    <div className="flex flex-wrap gap-1.5">
      {isImage && (
        <Chip active={durationSec === undefined} disabled={disabled} onClick={() => setDuration(undefined)}>
          Auto
        </Chip>
      )}
      {presets.map((p) => (
        <Chip
          key={p}
          active={effective === p || (requested === p && effective !== undefined && effective < p)}
          disabled={disabled || (known && p > remaining + 0.05)}
          onClick={() => setDuration(p)}
        >
          {presetLabel(p)}
        </Chip>
      ))}
      {known && (
        <Chip
          active={effective !== undefined && Math.abs(effective - untilEnd) < 0.05}
          disabled={disabled}
          onClick={() => setDuration(untilEnd)}
        >
          <ArrowRightToLineIcon className="size-3.5" />
          Hasta el final
        </Chip>
      )}
    </div>
  );
}

function Notes() {
  const { clipped, effective, requested, smoothness, disabled } = useSegment();
  const hq = useConverterStore((s) => s.options.hq ?? false);
  const update = useConverterStore((s) => s.updateOptions);
  if (!clipped && smoothness === "fluid") return null;
  return (
    <div className="space-y-2 text-[13px] leading-snug text-muted-foreground">
      {clipped && effective !== undefined && requested !== undefined && (
        <p>
          El video termina antes: se usarán {formatTime(effective)} en lugar de {formatTime(requested)}.
        </p>
      )}
      {smoothness !== "fluid" && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>
            {smoothness === "reduced"
              ? "Clip largo: se verá menos fluido para entrar en 500 KB."
              : "Clip muy largo: quedará casi como diapositivas. El sonido se mantiene completo."}
          </span>
          {!hq && (
            <Button variant="link" size="xs" className="h-auto p-0" disabled={disabled} onClick={() => update({ hq: true })}>
              Activar calidad alta
            </Button>
          )}
        </p>
      )}
    </div>
  );
}

function Chip({
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
      variant={active ? "default" : "secondary"}
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={cn("h-8 rounded-full px-3 text-[13px] tabular-nums")}
    >
      {children}
    </Button>
  );
}
