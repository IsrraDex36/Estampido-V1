import type { FitMode } from "../../config/limits.js";

/**
 * Square-canvas filter chain shared by video and image encoders.
 * pad: whole frame visible, transparent bars. crop: fill, center crop.
 * Alpha from the source (GIF/PNG/WebP) is preserved in both modes.
 */
export function buildFitFilter(fit: FitMode, size: number): string[] {
  if (fit === "pad") {
    return [
      `scale=${size}:${size}:force_original_aspect_ratio=decrease:flags=lanczos`,
      "format=rgba",
      `pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
    ];
  }
  return [
    `scale=${size}:${size}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${size}:${size}`,
    "format=rgba",
  ];
}
