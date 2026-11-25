import { type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject, useRef } from "react";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { centerSpanAt, dragTrim, hitTest, nudge, type Span, type TrimDrag, type TrimLimits } from "../../model/trim";

const HANDLE_PX = 16;

/**
 * Filmstrip with a white frame and two grips (WhatsApp/Instagram style):
 * drag a grip to trim, drag the frame to slide it, tap outside to jump there.
 */
export function Trimmer({
  strip,
  resizable = true,
  label = "Recortar: arrastra los bordes o el marco",
  headerExtra,
  span,
  limits,
  disabled,
  playheadRef,
  onChange,
  onScrub,
  onDragging,
}: {
  /** What's under the frame: filmstrip, waveform… */
  strip: ReactNode;
  /** false: fixed length, the frame only slides (grips move it too). */
  resizable?: boolean;
  label?: string;
  headerExtra?: ReactNode;
  span: Span;
  limits: TrimLimits;
  disabled?: boolean;
  playheadRef: RefObject<HTMLSpanElement | null>;
  onChange: (span: Span) => void;
  /** Show this instant in the preview while dragging. */
  onScrub: (sec: number) => void;
  onDragging: (dragging: boolean) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: TrimDrag; offset: number } | null>(null);
  const { total } = limits;
  const left = (span.start / total) * 100;
  const right = (span.end / total) * 100;

  const timeAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return { at: 0, tol: 0 };
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return { at: ratio * total, tol: (HANDLE_PX / rect.width) * total };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button > 0) return;
    const { at, tol } = timeAt(e.clientX);
    let current = span;
    let mode = hitTest(at, span, tol);
    if (!resizable && mode !== "outside") mode = "move";
    if (mode === "outside") {
      current = centerSpanAt(at, span, total);
      onChange(current);
      onScrub(current.start);
      mode = "move";
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, offset: at - current.start };
    onDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const next = dragTrim(d.mode, timeAt(e.clientX).at, d.offset, span, limits);
    if (next.start === span.start && next.end === span.end) return;
    onChange(next);
    onScrub(d.mode === "end" ? next.end : next.start);
  };
  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    onDragging(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="text-muted-foreground">
          Tramo{" "}
          <span className="font-mono text-foreground tabular-nums">
            {formatTime(span.start)} – {formatTime(span.end)}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {headerExtra}
          <span className="rounded-full bg-sound-soft px-2.5 py-0.5 font-mono text-[12px] font-medium text-sound tabular-nums">
            {formatTime(span.end - span.start)}
          </span>
        </span>
      </div>

      <div
        ref={trackRef}
        role="group"
        aria-label={label}
        className={cn("relative h-14 touch-none select-none", disabled ? "opacity-60" : "cursor-pointer")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="absolute inset-x-0 inset-y-1 flex overflow-hidden rounded-lg bg-muted" aria-hidden>
          {strip}
        </div>
        <span className="absolute inset-y-1 left-0 rounded-l-lg bg-black/60" style={{ width: `${left}%` }} aria-hidden />
        <span className="absolute inset-y-1 right-0 rounded-r-lg bg-black/60" style={{ width: `${100 - right}%` }} aria-hidden />
        <span
          className="pointer-events-none absolute inset-y-0 rounded-lg border-y-[3px] border-white shadow-[0_0_0_1px_rgb(0_0_0/0.15)]"
          style={{ left: `${left}%`, width: `${right - left}%` }}
          aria-hidden
        />
        <Grip side="start" pos={left} span={span} limits={limits} resizable={resizable} disabled={disabled} onChange={onChange} />
        <Grip side="end" pos={right} span={span} limits={limits} resizable={resizable} disabled={disabled} onChange={onChange} />
        <span
          ref={playheadRef}
          className="pointer-events-none absolute inset-y-0 left-0 w-[3px] -translate-x-1/2 rounded-full bg-white ring-1 ring-black/30 shadow-[0_0_4px_rgb(0_0_0/0.5)]"
          aria-hidden
        />
      </div>

      <div className="flex justify-between font-mono text-[11px] text-muted-foreground tabular-nums">
        <span>0:00</span>
        <span>{formatTime(total)}</span>
      </div>
    </div>
  );
}

/** One white grip; also the keyboard way in (arrows ±0.1 s, Shift ±1 s). */
function Grip({
  side,
  pos,
  span,
  limits,
  resizable,
  disabled,
  onChange,
}: {
  side: "start" | "end";
  pos: number;
  span: Span;
  limits: TrimLimits;
  resizable: boolean;
  disabled?: boolean;
  onChange: (span: Span) => void;
}) {
  const value = side === "start" ? span.start : span.end;
  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    const step = e.shiftKey ? 1 : 0.1;
    const delta = e.key === "ArrowLeft" || e.key === "ArrowDown" ? -step : e.key === "ArrowRight" || e.key === "ArrowUp" ? step : 0;
    if (!delta) return;
    e.preventDefault();
    onChange(resizable ? nudge(side, delta, span, limits) : dragTrim("move", span.start + delta, 0, span, limits));
  };
  return (
    <span
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={resizable ? (side === "start" ? "Inicio del tramo" : "Fin del tramo") : side === "start" ? "Mover el tramo" : "Mover el tramo (fin)"}
      aria-valuemin={0}
      aria-valuemax={limits.total}
      aria-valuenow={value}
      aria-valuetext={formatTime(value)}
      aria-disabled={disabled}
      onKeyDown={disabled ? undefined : onKeyDown}
      className={cn(
        "absolute inset-y-0 grid w-4 place-items-center bg-white outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        side === "start" ? "rounded-l-lg" : "-translate-x-full rounded-r-lg",
        !disabled && (resizable ? "cursor-ew-resize" : "cursor-grab"),
      )}
      style={{ left: `${pos}%` }}
    >
      <span className="h-5 w-[3px] rounded-full bg-black/45" aria-hidden />
    </span>
  );
}

/** Video frames under the trimmer (gray placeholders until decoded). */
export function Filmstrip({ frames }: { frames: (string | null)[] }) {
  return frames.map((src, i) =>
    src ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: frames are positional
      <img key={i} src={src} alt="" draggable={false} className="h-full min-w-0 flex-1 object-cover" />
    ) : (
      <span
        // biome-ignore lint/suspicious/noArrayIndexKey: frames are positional
        key={i}
        className="h-full min-w-0 flex-1 animate-pulse border-r border-background/30 bg-foreground/10 motion-reduce:animate-none"
      />
    ),
  );
}

/** Waveform bars under the trimmer. */
export function WaveStrip({ peaks }: { peaks: number[] }) {
  return (
    <span className="flex size-full items-center gap-[2px] px-1">
      {peaks.map((p, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed bars of one decoded file
          key={i}
          className="min-w-0 flex-1 rounded-full bg-sound"
          style={{ height: `${Math.max(10, Math.round(p * 88))}%` }}
        />
      ))}
    </span>
  );
}
