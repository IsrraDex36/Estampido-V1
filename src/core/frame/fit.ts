import type { FitMode, StickerBackground } from "../../config/limits.js";

/**
 * Square-canvas filter chain shared by video and image encoders.
 * pad: whole frame visible; the bars are transparent, a solid color, or a
 * blurred, zoomed copy of the frame. crop: fill, center crop.
 * Alpha from the source (GIF/PNG/WebP) is preserved.
 */
export function buildFitFilter(fit: FitMode, size: number, background: StickerBackground = "transparent"): string[] {
  if (fit === "crop") {
    return [
      `scale=${size}:${size}:force_original_aspect_ratio=increase:flags=lanczos`,
      `crop=${size}:${size}`,
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
