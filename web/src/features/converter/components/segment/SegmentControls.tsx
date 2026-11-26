import type { ReactNode } from "react";
import {
  ArrowRightToLineIcon,
  AudioWaveformIcon,
  ImageIcon,
  MinusIcon,
  PlusIcon,
  TimerIcon,
  TriangleAlertIcon,
} from "@/components/icons";
import { TimeInput } from "@/components/time-input";
import { Button } from "@/components/ui/button";
import { formatTime, presetLabel, type Smoothness } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useFrameAt } from "../../hooks/useFrameAt";
import { useConverterStore } from "../../store/converterStore";
import { usePlaybackStore } from "../../store/playbackStore";
import { useSegment } from "./useSegment";

/** Same as the server's STICKER_LIMITS.whatsappMaxAnimationSec (official sticker guide). */
const WHATSAPP_MAX_ANIMATION_SEC = 10;

/**
 * «Tiempo»: start and end as frame cards with fine ±0.1 s steppers, the
 * length with presets, and how smooth that length will look.
 */
export function SegmentControls() {
  const seg = useSegment();
  return (
    <div className="space-y-4">
      {seg.isImage ? <ImageIntro /> : <Edges />}
      <DurationCard />
      {!seg.isImage && <SmoothnessMeter />}
      {!seg.isImage && <WhatsAppLengthNote />}
      <ClippedNote />
    </div>
  );
}

/** Start/end cards (videos: with the actual frame). */
function Edges() {
  const { isVideo, start, end, known, sourceDuration, minDuration, maxDuration, disabled, setStart, setRange } = useSegment();
  const url = useConverterStore((s) => (s.inputKind === "video" ? s.previewUrl : null));
  const startFrame = useFrameAt(isVideo ? url : null, start);
  const endFrame = useFrameAt(isVideo ? url : null, end);
  const maxStart = known ? Math.max(0, sourceDuration - minDuration) : undefined;
  const setEnd = (v: number) => setRange([start, Math.max(start + minDuration, Math.min(v, start + maxDuration, known ? sourceDuration : v))]);

  return (
    <div className="grid grid-cols-2 gap-3">
      <EdgeCard
        id="start"
        label="Inicio"
        time={start}
        frame={startFrame}
        showFrame={isVideo}
        min={0}
        max={maxStart}
        disabled={disabled}
        onTime={(v) => setStart(Math.max(0, Math.min(v, maxStart ?? v)))}
        corner={isVideo && <UseCurrentTime />}
      />
      <EdgeCard
        id="end"
        label="Fin"
        time={end ?? start}
        frame={endFrame}
        showFrame={isVideo}
        min={start + minDuration}
        max={known ? sourceDuration : undefined}
        disabled={disabled || end === undefined}
        onTime={setEnd}
      />
    </div>
  );
}

function EdgeCard({
  id,
  label,
  time,
  frame,
  showFrame,
  min,
  max,
  disabled,
  onTime,
  corner,
}: {
  id: string;
  label: string;
  time: number;
  frame: string | null;
  showFrame: boolean;
  min: number;
  max?: number;
  disabled: boolean;
  onTime: (sec: number) => void;
  corner?: ReactNode;
}) {
  const step = (d: number) => onTime(Math.round((time + d) * 10) / 10);
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl bg-muted/60">
      {showFrame && (
        <div className="relative aspect-video bg-black">
          {frame ? (
            <img src={frame} alt={`Cuadro en ${formatTime(time)}`} className="size-full object-contain" />
          ) : (
            <span className="absolute inset-0 animate-pulse bg-foreground/10 motion-reduce:animate-none" />
          )}
          <span className="absolute top-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            {label}
          </span>
          {corner && <span className="absolute top-1.5 right-1.5">{corner}</span>}
        </div>
      )}
      <div className="space-y-1.5 p-2 sm:p-2.5">
        {!showFrame && (
          <label htmlFor={id} className="block px-1 text-[12px] text-muted-foreground">
            {label}
          </label>
        )}
        <div className="flex items-center gap-0.5 sm:gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 rounded-full sm:size-8"
            disabled={disabled || time - 0.1 < min - 0.001}
            aria-label={`${label}: 0.1 s antes`}
            onClick={() => step(-0.1)}
          >
            <MinusIcon />
          </Button>
          <TimeInput
            id={id}
            aria-label={label}
            className="h-9 min-w-0 flex-1 px-0.5 text-center font-mono text-[13px] tabular-nums sm:text-sm"
            value={time}
            min={min}
            max={max}
            disabled={disabled}
            onValueChange={(v) => v !== undefined && onTime(v)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 rounded-full sm:size-8"
            disabled={disabled || (max !== undefined && time + 0.1 > max + 0.001)}
            aria-label={`${label}: 0.1 s después`}
            onClick={() => step(0.1)}
          >
            <PlusIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Only this button subscribes to the (high-frequency) playhead. */
function UseCurrentTime() {
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const { disabled, setStart } = useSegment();
  return (
    <button
      type="button"
      disabled={disabled || currentTime === undefined}
      title="Empezar donde va el video"
      aria-label="Empezar donde va el video"
      onClick={() => currentTime !== undefined && setStart(currentTime)}
      className="grid size-7 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/70 disabled:opacity-40"
    >
      <TimerIcon className="size-3.5" />
    </button>
  );
}

function ImageIntro() {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-muted/60 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sound-soft text-sound">
        <ImageIcon className="size-5" weight="duotone" />
      </span>
      <p className="text-[13px] leading-snug text-muted-foreground">
        La imagen queda fija. Aquí eliges <span className="text-foreground">cuánto dura el sonido</span>; «Auto» usa el audio
        completo.
      </p>
    </div>
  );
}

/** Big length readout + field + presets. */
function DurationCard() {
  const { isImage, isVideo, presets, known, remaining, effective, requested, maxDuration, minDuration, disabled, setDuration } =
    useSegment();
  const durationSec = useConverterStore((s) => s.options.durationSec);
  const untilEnd = Math.round(Math.min(maxDuration, remaining) * 10) / 10;
  const shown = effective ?? requested;

  return (
    <div className="space-y-3 rounded-2xl bg-muted/60 p-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            {isImage ? <AudioWaveformIcon className="size-3.5" /> : <TimerIcon className="size-3.5" />}
            {isImage ? "El sonido dura" : "Duración"}
          </p>
          <p className="font-mono text-3xl leading-none font-semibold tracking-tight tabular-nums">
            {shown !== undefined ? formatTime(shown) : "Auto"}
          </p>
        </div>
        <label className="flex shrink-0 flex-col items-end gap-1 text-[11px] text-muted-foreground" htmlFor="duration">
          máx. {presetLabel(maxDuration)}
          <TimeInput
            id="duration"
            className="h-9 w-24 text-center font-mono tabular-nums"
            value={durationSec}
            min={minDuration}
            max={maxDuration}
            allowEmpty={isImage}
            placeholder={isImage ? "auto" : "0:05"}
            disabled={disabled}
            onValueChange={setDuration}
          />
        </label>
      </div>

      {/* Phones: one row that scrolls sideways (fades at the edge); wider: wraps. */}
      <div className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] max-sm:[mask-image:linear-gradient(to_right,black_85%,transparent)] sm:flex-wrap [&::-webkit-scrollbar]:hidden [&>*]:shrink-0 [&>*]:snap-start">
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
        {isVideo && known && (
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
    </div>
  );
}

const SMOOTH: Record<Smoothness, { level: number; title: string; detail: string }> = {
  fluid: { level: 3, title: "Fluido", detail: "14–15 fps asegurados: si pesa, se ajusta la nitidez, no la fluidez." },
  reduced: { level: 2, title: "Menos fluido", detail: "Más de 10 s: puede bajar de 14 fps para entrar en 500 KB." },
  slideshow: { level: 1, title: "Tipo diapositivas", detail: "Muy largo: casi fotos fijas. El sonido se mantiene completo." },
};

/** How the length trades against the 500 KB budget. */
function SmoothnessMeter() {
  const { smoothness, disabled } = useSegment();
  const hq = useConverterStore((s) => s.options.hq ?? false);
  const update = useConverterStore((s) => s.updateOptions);
  const s = SMOOTH[smoothness];
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-muted/60 px-4 py-3">
      <span className="flex h-6 shrink-0 items-end gap-1" aria-hidden>
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={cn(
              "w-1.5 rounded-full transition-colors",
              n === 1 ? "h-2" : n === 2 ? "h-4" : "h-6",
              n <= s.level ? (s.level === 3 ? "bg-sound" : "bg-retro-a") : "bg-foreground/15",
            )}
          />
        ))}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] leading-tight font-medium">
          {s.title}
          {hq && <span className="ml-1.5 text-[12px] font-normal text-muted-foreground">· calidad alta</span>}
        </p>
        <p className="text-[12px] leading-snug text-muted-foreground">{s.detail}</p>
      </div>
      {smoothness !== "fluid" && !hq && (
        <Button variant="link" size="xs" className="h-auto shrink-0 p-0" disabled={disabled} onClick={() => update({ hq: true })}>
          Calidad alta
        </Button>
      )}
    </div>
  );
}

/** WhatsApp animates up to 10 s (official sticker guide); longer freezes in the chat. */
function WhatsAppLengthNote() {
  const { effective, requested, isImage, disabled, setDuration } = useSegment();
  const len = effective ?? requested;
  if (isImage || len === undefined || len <= WHATSAPP_MAX_ANIMATION_SEC + 0.05) return null;
  return (
    <div role="note" className="flex items-start gap-3 rounded-2xl bg-retro-a/10 px-4 py-3 text-[13px] leading-snug">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-retro-a" weight="fill" />
      <p className="min-w-0 flex-1">
        <b>WhatsApp anima hasta {WHATSAPP_MAX_ANIMATION_SEC} s.</b> Con {formatTime(len)}, en el chat la imagen se quedará
        quieta mientras suena. Sirve para descargar; para enviar, mejor 5–10 s.{" "}
        <Button
          variant="link"
          size="xs"
          className="h-auto p-0 align-baseline"
          disabled={disabled}
          onClick={() => setDuration(WHATSAPP_MAX_ANIMATION_SEC)}
        >
          Usar {WHATSAPP_MAX_ANIMATION_SEC} s
        </Button>
      </p>
    </div>
  );
}

function ClippedNote() {
  const { clipped, effective, requested } = useSegment();
  if (!clipped || effective === undefined || requested === undefined) return null;
  return (
    <p className="px-1 text-[13px] leading-snug text-muted-foreground">
      El video termina antes: se usarán {formatTime(effective)} en lugar de {formatTime(requested)}.
    </p>
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
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant={active ? "default" : "secondary"}
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className="h-8 rounded-full px-3 text-[13px] tabular-nums"
    >
      {children}
    </Button>
  );
}
