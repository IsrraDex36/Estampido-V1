import {
  type CropFrame,
  DEFAULT_FIT,
  type FitMode,
  STICKER_LIMITS,
  type StickerBackground,
} from "../../config/limits.js";
import { ffmpegPath, run } from "../../utils/ffmpeg.js";
import { buildFitFilter } from "../frame/fit.js";

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
  background?: StickerBackground;
  /** "crop" only: position + zoom. */
  crop?: CropFrame;
  size?: number;
  /**
   * "input" (default): fast keyframe seek before decoding, right for videos.
   * "output": decode from the start, then trim. Required for animated WebP,
   * whose demuxer breaks with input seeking (libwebp_anim then fails).
   */
  seek?: "input" | "output";
  signal?: AbortSignal;
}

/** Build the -vf chain. Exported for unit testing. */
export function buildVideoFilter(
  fit: FitMode,
  fps: number,
  size: number,
  background?: StickerBackground,
  crop?: CropFrame,
): string {
  return [`fps=${fps}`, ...buildFitFilter(fit, size, background, crop)].join(",");
}

/** Build the full ffmpeg arg list. Exported for unit testing. */
export function buildVideoArgs(opts: EncodeVideoOptions): string[] {
  const fps = opts.fps ?? STICKER_LIMITS.defaultFps;
  const quality = opts.quality ?? 75;
  const size = opts.size ?? STICKER_LIMITS.size;
  const fit = opts.fit ?? DEFAULT_FIT;
  const trim = ["-ss", String(opts.startSec), "-t", String(opts.durationSec)];

  return [
    "-hide_banner",
    "-v",
    "error",
    "-y",
    ...(opts.seek === "output" ? ["-i", opts.input, ...trim] : [...trim, "-i", opts.input]),
    "-vf",
    buildVideoFilter(fit, fps, size, opts.background, opts.crop),
    "-an",
    // Constant frame rate → uniform frame durations (variable ones get rejected by WhatsApp).
    "-fps_mode",
    "cfr",
    "-c:v",
    "libwebp_anim",
    "-lossless",
    "0",
    // "picture" tuning (SNS/filter): ~5–10 % smaller at the same PSNR vs the
    // default, at no extra encode time → the fps optimizer fits more frames.
    // (compression_level 6 saves similar but encodes ~50× slower; cr_threshold
    // and pre-denoise measured no gain.)
    "-preset",
    "picture",
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

/** Long clips need more time than run()'s 2-minute default. */
export const encodeTimeoutMs = (durationSec: number): number => Math.max(120_000, durationSec * 3_000);

export async function encodeVideo(opts: EncodeVideoOptions): Promise<void> {
  await run(ffmpegPath(), buildVideoArgs(opts), { timeoutMs: encodeTimeoutMs(opts.durationSec), signal: opts.signal });
}
