import type { FitMode, StickerBackground } from "@contract";
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
