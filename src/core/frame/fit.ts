import type { CropFrame, FitMode, StickerBackground } from "../../config/limits.js";

/**
 * Square-canvas filter chain shared by video and image encoders.
 * pad: whole frame visible; the bars are transparent, a solid color, or a
 * blurred, zoomed copy of the frame. crop: fill, center crop.
 * Alpha from the source (GIF/PNG/WebP) is preserved.
 */
const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0.5));
const num = (n: number) => String(Math.round(n * 10000) / 10000);

export function buildFitFilter(
  fit: FitMode,
  size: number,
  background: StickerBackground = "transparent",
  frame?: CropFrame,
): string[] {
  if (fit === "crop") {
    if (!frame || (frame.zoom <= 1 && frame.x === 0.5 && frame.y === 0.5)) {
      return [
        `scale=${size}:${size}:force_original_aspect_ratio=increase:flags=lanczos`,
        `crop=${size}:${size}`,
        "format=rgba",
      ];
    }
    // Cover a (size·zoom)² box, then cut the square where the user placed it.
    const zoom = Math.min(4, Math.max(1, frame.zoom));
    const box = Math.round((size * zoom) / 2) * 2;
    return [
      `scale=${box}:${box}:force_original_aspect_ratio=increase:flags=lanczos`,
      `crop=${size}:${size}:(iw-ow)*${num(clamp01(frame.x))}:(ih-oh)*${num(clamp01(frame.y))}`,
      "format=rgba",
    ];
  }
  const fitInside = `scale=${size}:${size}:force_original_aspect_ratio=decrease:flags=lanczos`;
  if (background === "blur") {
    // One chain in, one out (valid inside -vf): split → blurred fill + fitted frame → overlay.
    return [
      `split[sva_bg][sva_fg];[sva_bg]scale=${size}:${size}:force_original_aspect_ratio=increase,crop=${size}:${size},boxblur=24:2,eq=brightness=-0.06[sva_b];[sva_fg]${fitInside}[sva_f];[sva_b][sva_f]overlay=(W-w)/2:(H-h)/2`,
      "format=rgba",
    ];
  }
  const pad = `pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`;
  if (background === "transparent") return [fitInside, "format=rgba", pad];
  // Solid color behind everything (bars and the source's own transparency):
  // fill a copy with the color, then overlay the frame on it.
  return [
    fitInside,
    "format=rgba",
    pad,
    `split[sva_c][sva_f];[sva_c]drawbox=c=0x${background.slice(1)}@1:t=fill:replace=1[sva_b];[sva_b][sva_f]overlay=format=auto`,
    "format=rgba",
  ];
}
