import {
  DEFAULT_FIT,
  type FitMode,
  STICKER_LIMITS,
} from "../../config/limits.js";
import { ffmpegPath, run } from "../../utils/ffmpeg.js";

export interface EncodeVideoOptions {
  input: string;
  output: string;
  /** Segment start (s). */
  startSec: number;
  /** Segment length (s); caller is responsible for clamping to source. */
  durationSec: number;
  fps?: number;
  /** libwebp quality 0–100. */
  quality?: number;
  fit?: FitMode;
  size?: number;
}

/** Build the -vf chain. Exported for unit testing. */
export function buildVideoFilter(
  fit: FitMode,
  fps: number,
  size: number,
): string {
  const common = [`fps=${fps}`];
  if (fit === "pad") {
    return [
      ...common,
      `scale=${size}:${size}:force_original_aspect_ratio=decrease:flags=lanczos`,
      "format=rgba",
      `pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
    ].join(",");
  }
  return [
    ...common,
    `scale=${size}:${size}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${size}:${size}`,
    "format=rgba",
  ].join(",");
}

/** Build the full ffmpeg arg list. Exported for unit testing. */
export function buildVideoArgs(opts: EncodeVideoOptions): string[] {
  const fps = opts.fps ?? STICKER_LIMITS.defaultFps;
  const quality = opts.quality ?? 75;
  const size = opts.size ?? STICKER_LIMITS.size;
  const fit = opts.fit ?? DEFAULT_FIT;

  return [
    "-hide_banner",
    "-v",
    "error",
    "-y",
    "-ss",
    String(opts.startSec),
    "-t",
    String(opts.durationSec),
    "-i",
    opts.input,
    "-vf",
    buildVideoFilter(fit, fps, size),
    "-an",
    // Constant frame rate → uniform frame durations (variable ones get rejected by WhatsApp).
    "-fps_mode",
    "cfr",
    "-c:v",
    "libwebp_anim",
    "-lossless",
    "0",
    "-quality",
    String(quality),
    "-compression_level",
    "4",
    "-loop",
    "0",
    "-f",
    "webp",
    opts.output,
  ];
}

export async function encodeVideo(opts: EncodeVideoOptions): Promise<void> {
  await run(ffmpegPath(), buildVideoArgs(opts));
}
