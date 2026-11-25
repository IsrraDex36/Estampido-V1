import type { FitMode, StickerBackground } from "@contract";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Live mini-sticker: the clip's still on the square canvas, as the encoder
 * will lay it out (crop / pad + background). Approximate, instant.
 */
export function StickerLook({
  still,
  fit,
  background,
  className,
}: {
  still: string | null;
  fit: FitMode;
  background: StickerBackground;
  className?: string;
}) {
  const solid = background.startsWith("#") ? background : undefined;
  return (
    <span
      className={cn(
        "relative block aspect-square w-full overflow-hidden rounded-xl",
        fit === "pad" && background === "transparent" && "checkerboard",
        className,
      )}
      style={fit === "pad" && solid ? { backgroundColor: solid } : undefined}
    >
      {still ? (
        <>
          {fit === "pad" && background === "blur" && (
            <img src={still} alt="" className="absolute inset-0 size-full scale-110 object-cover blur-md brightness-95" />
          )}
          <img
            src={still}
            alt=""
            draggable={false}
            className={cn("absolute inset-0 size-full", fit === "crop" ? "object-cover" : "object-contain")}
          />
        </>
      ) : (
        <span className={cn("absolute inset-x-0 top-1/2 -translate-y-1/2 bg-foreground/80", fit === "pad" ? "h-[56%]" : "h-full")} />
      )}
    </span>
  );
}

/**
 * Big live preview for «Estilo»: the chosen stretch playing (muted, looped)
 * on the square canvas with the chosen fit and background. Still for images
 * or reduced motion.
 */
export function LiveSticker({
  src,
  isVideo,
  still,
  start,
  end,
  fit,
  background,
  className,
}: {
  src: string | null;
  isVideo: boolean;
  still: string | null;
  start: number;
  end: number | undefined;
  fit: FitMode;
  background: StickerBackground;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const live = isVideo && src && !reduced;

  useEffect(() => {
    const v = ref.current;
    if (v && v.readyState >= 1) v.currentTime = start;
  }, [start]);

  const solid = background.startsWith("#") ? background : undefined;
  const media = live ? (
    <video
      ref={ref}
      src={src}
      muted
      autoPlay
      playsInline
      preload="auto"
      className={cn("absolute inset-0 size-full", fit === "crop" ? "object-cover" : "object-contain")}
      onLoadedMetadata={(e) => {
        e.currentTarget.currentTime = start;
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
  ) : (still ?? src) ? (
    <img
      src={still ?? src ?? ""}
      alt=""
      draggable={false}
      className={cn("absolute inset-0 size-full", fit === "crop" ? "object-cover" : "object-contain")}
    />
  ) : null;

  return (
    <span
      className={cn(
        "relative block aspect-square overflow-hidden rounded-2xl shadow-[0_8px_24px_-8px_rgb(0_0_0/0.45)]",
        fit === "pad" && background === "transparent" && "checkerboard",
        className,
      )}
      style={fit === "pad" && solid ? { backgroundColor: solid } : undefined}
    >
      {fit === "pad" && background === "blur" && (still ?? (!isVideo ? src : null)) && (
        <img
          src={still ?? src ?? ""}
          alt=""
          className="absolute inset-0 size-full scale-110 object-cover blur-lg brightness-95"
        />
      )}
      {media}
    </span>
  );
}
