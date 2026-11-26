import {
  type CropFrame,
  DEFAULT_FIT,
  type FitMode,
  STICKER_LIMITS,
  type StickerBackground,
} from "../../config/limits.js";
import { ffmpegPath, run } from "../../utils/ffmpeg.js";
import { buildFitFilter } from "../frame/fit.js";
import { OVERLAY_OUT, overlayGraph } from "../frame/overlay.js";
import type { EncodeAttempt } from "../optimize/fitToSize.js";

export interface EncodeImageOptions {
  input: string;
  output: string;
  quality?: number;
  fit?: FitMode;
  background?: StickerBackground;
  /** "crop" only: position + zoom. */
  crop?: CropFrame;
  size?: number;
  /** Transparent PNG drawn over the picture (meme text). */
  overlay?: string;
  signal?: AbortSignal;
}

/** Quality-only ladder for static stickers (fps unused → 0). */
export const STATIC_LADDER: readonly EncodeAttempt[] = [80, 70, 60, 50, 40, 30, 20, 10].map((quality) => ({
  quality,
  fps: 0,
}));

/** Still image → static 512×512 WebP (first frame only). */
export function buildImageArgs(opts: EncodeImageOptions): string[] {
  const size = opts.size ?? STICKER_LIMITS.size;
  const chain = buildFitFilter(opts.fit ?? DEFAULT_FIT, size, opts.background, opts.crop).join(",");
  return [
    "-hide_banner",
    "-v",
    "error",
    "-y",
    "-i",
    opts.input,
    ...(opts.overlay
      ? ["-i", opts.overlay, "-filter_complex", overlayGraph(chain, size), "-map", OVERLAY_OUT]
      : ["-vf", chain]),
    "-frames:v",
    "1",
    "-an",
    "-c:v",
    "libwebp",
    "-lossless",
    "0",
    "-quality",
    String(opts.quality ?? 80),
    "-compression_level",
    "6",
    "-f",
    "webp",
    opts.output,
  ];
}

export async function encodeImage(opts: EncodeImageOptions): Promise<void> {
  await run(ffmpegPath(), buildImageArgs(opts), { signal: opts.signal });
}
