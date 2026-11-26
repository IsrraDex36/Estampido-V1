import type { FitMode, StickerBackground } from "@contract";
import { type CSSProperties, type PointerEvent, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CENTERED, type CropFrame, cropStyle, panCrop, zoomCrop } from "../../model/crop";
import { LOOK_CSS, type PreviewAdjust } from "../../model/look";

/**
 * Position/size of the media in the square, as the encoder will lay it out.
 * The server mirrors BEFORE cropping: mirrored, the element is placed at the
 * opposite x and flipped in place, so the visible part matches the result.
 */
function mediaStyle(fit: FitMode, frame: CropFrame, adjust?: PreviewAdjust): { className: string; style?: CSSProperties } {
  const look: CSSProperties = {
    ...(adjust?.look ? { filter: LOOK_CSS[adjust.look] } : {}),
    ...(adjust?.flip ? { transform: "scaleX(-1)" } : {}),
  };
  if (fit === "pad") return { className: "absolute inset-0 size-full object-contain", style: look };
  const s = cropStyle(adjust?.flip ? { ...frame, x: 1 - frame.x } : frame);
  return {
    className: "absolute max-w-none object-cover",
    style: { width: s.width, height: s.height, left: s.left, top: s.top, objectPosition: s.objectPosition, ...look },
  };
}

function Canvas({
  fit,
  background,
  blurSrc,
  blurFilter,
  className,
  children,
  ...rest
}: {
  fit: FitMode;
  background: StickerBackground;
  blurSrc: string | null;
  /** The look applies to the blurred bars too (the server filters before framing). */
  blurFilter?: string;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentProps<"span">, "children">) {
  const solid = background.startsWith("#") ? background : undefined;
  return (
    <span
      className={cn(
        "relative block aspect-square overflow-hidden",
        fit === "pad" && background === "transparent" && "checkerboard",
        className,
      )}
      style={fit === "pad" && solid ? { backgroundColor: solid } : undefined}
      {...rest}
    >
      {fit === "pad" && background === "blur" && blurSrc && (
        <img
          src={blurSrc}
          alt=""
          className="absolute inset-0 size-full scale-110 object-cover blur-lg brightness-95"
          style={blurFilter ? { filter: `${blurFilter} blur(16px) brightness(0.95)` } : undefined}
        />
      )}
      {children}
    </span>
  );
}

/** Small static mini-sticker (fit cards, pack card). */
export function StickerLook({
  still,
  fit,
  background,
  frame = CENTERED,
  adjust,
  className,
}: {
  still: string | null;
  fit: FitMode;
  background: StickerBackground;
  frame?: CropFrame;
  adjust?: PreviewAdjust;
  className?: string;
}) {
  const m = mediaStyle(fit, frame, adjust);
  return (
    <Canvas
      fit={fit}
      background={background}
      blurSrc={still}
      blurFilter={adjust?.look ? LOOK_CSS[adjust.look] : undefined}
      className={cn("w-full rounded-xl", className)}
    >
      {still ? (
        <img src={still} alt="" draggable={false} className={m.className} style={m.style} />
      ) : (
        <span className={cn("absolute inset-x-0 top-1/2 -translate-y-1/2 bg-foreground/80", fit === "pad" ? "h-[56%]" : "h-full")} />
      )}
    </Canvas>
  );
}

/**
 * Big live preview for «Estilo»: the chosen stretch playing (muted, looped)
 * with the current fit and background. In «Llenar», drag to place the
 * picture and pinch to zoom (onFrame). Still for images / reduced motion.
 */
export function LiveSticker({
  src,
  isVideo,
  still,
  start,
  end,
  fit,
  background,
  frame = CENTERED,
  onFrame,
  adjust,
  className,
}: {
  src: string | null;
  isVideo: boolean;
  still: string | null;
  start: number;
  end: number | undefined;
  fit: FitMode;
  background: StickerBackground;
  frame?: CropFrame;
  onFrame?: (frame: CropFrame) => void;
  /** Color look + mirror (preview of the server filters). */
  adjust?: PreviewAdjust;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLSpanElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const [aspect, setAspect] = useState(16 / 9);
  const [dragging, setDragging] = useState(false);
  const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const live = isVideo && src && !reduced;
  const editable = fit === "crop" && Boolean(onFrame);

  useEffect(() => {
    const v = ref.current;
    if (v && v.readyState >= 1) v.currentTime = start;
  }, [start]);

  const onDown = (e: PointerEvent<HTMLSpanElement>) => {
    if (!editable) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: frame.zoom };
    }
    setDragging(true);
  };
  const onMove = (e: PointerEvent<HTMLSpanElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!editable || !prev || !onFrame) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const box = boxRef.current?.getBoundingClientRect().width ?? 0;
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current.dist > 0) onFrame(zoomCrop(frame, pinch.current.zoom * (dist / pinch.current.dist)));
      return;
    }
    // Mirrored, the picture moves the other way on screen: invert the horizontal drag.
    const dx = (e.clientX - prev.x) * (adjust?.flip ? -1 : 1);
    if (box > 0) onFrame(panCrop(frame, dx, e.clientY - prev.y, aspect, box));
  };
  const onUp = (e: PointerEvent<HTMLSpanElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) setDragging(false);
  };

  const m = mediaStyle(fit, frame, adjust);
  const fallback = still ?? src;

  return (
    <Canvas
      ref={boxRef}
      fit={fit}
      background={background}
      blurSrc={still ?? (!isVideo ? src : null)}
      blurFilter={adjust?.look ? LOOK_CSS[adjust.look] : undefined}
      className={cn(
        "rounded-2xl shadow-[0_8px_24px_-8px_rgb(0_0_0/0.45)]",
        editable && "cursor-grab touch-none select-none active:cursor-grabbing",
        className,
      )}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      role={editable ? "application" : undefined}
      aria-label={editable ? "Encuadre: arrastra para mover, pellizca para acercar" : undefined}
    >
      {live ? (
        <video
          ref={ref}
          src={src}
          muted
          autoPlay
          playsInline
          preload="auto"
          className={cn("pointer-events-none", m.className)}
          style={m.style}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight);
            v.currentTime = start;
          }}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (end !== undefined && v.currentTime >= end - 0.05) v.currentTime = start;
          }}
          onEnded={(e) => {
            e.currentTarget.currentTime = start;
            void e.currentTarget.play().catch(() => {});
          }}
        />
      ) : fallback ? (
        <img
          src={fallback}
          alt=""
          draggable={false}
          className={cn("pointer-events-none", m.className)}
          style={m.style}
          onLoad={(e) => {
            const i = e.currentTarget;
            if (i.naturalWidth && i.naturalHeight) setAspect(i.naturalWidth / i.naturalHeight);
          }}
        />
      ) : null}
      {editable && (
        <span
          className={cn(
            "pointer-events-none absolute inset-0 transition-opacity duration-200",
            dragging ? "opacity-100" : "opacity-0",
          )}
          aria-hidden
        >
          {/* rule of thirds while placing */}
          <span className="absolute inset-y-0 left-1/3 w-px bg-white/60" />
          <span className="absolute inset-y-0 left-2/3 w-px bg-white/60" />
          <span className="absolute inset-x-0 top-1/3 h-px bg-white/60" />
          <span className="absolute inset-x-0 top-2/3 h-px bg-white/60" />
        </span>
      )}
    </Canvas>
  );
}
