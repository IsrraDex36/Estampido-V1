import type { FitResult } from "./fitToSize.js";

/**
 * FPS-first size fitting for animated stickers.
 *
 * Measured on worst-case clips: output size grows ~linearly with fps but only
 * weakly with libwebp quality (q20 → q10 saves ~15 %). Stepping fps and
 * quality down together (the old ladder) wasted budget — e.g. a 10 s clip
 * ended at 8 fps when ~11 fit. Strategy:
 *
 * 1. Probe: encode a short sample (≤ 4 s) at full fps for each quality,
 *    extrapolate to the whole clip. Cheap even for 3-minute clips.
 * 2. Keep the best quality that fits at full fps.
 * 3. Otherwise solve fps = budget / bytes-per-frame at the floor quality
 *    (or a lower one if that buys ≥ 25 % more fps), then encode the whole
 *    clip and shrink fps until it actually fits.
 */
export interface EncodeRequest {
  quality: number;
  fps: number;
  /** Seconds to encode (a probe sample or the whole clip). */
  durationSec: number;
  /** true = write the final output; false = scratch probe file. */
  final: boolean;
}

/** Encodes and returns the produced size in bytes. */
export type SizedEncoder = (req: EncodeRequest) => Promise<number>;

export interface FpsFirstOptions {
  durationSec: number;
  /** Highest useful fps (source fps cap; never upsample). */
  maxFps: number;
  maxBytes: number;
  /** Probe qualities, best first; the last two are the fps-solving floors. */
  qualities?: readonly number[];
  minFps?: number;
  sampleSec?: number;
  /** Aim slightly under the limit so the final encode rarely overshoots. */
  headroom?: number;
}

export const DEFAULT_QUALITIES = [75, 60, 45, 30, 20, 12] as const;

/** Round fps down to a clean value: 0.5 steps below 2, integers above. */
export const roundFps = (fps: number): number => (fps < 2 ? Math.floor(fps * 2) / 2 : Math.floor(fps));

export async function fitFpsFirst(encode: SizedEncoder, opts: FpsFirstOptions): Promise<FitResult> {
  const qualities = opts.qualities ?? DEFAULT_QUALITIES;
  const minFps = opts.minFps ?? 0.5;
  const headroom = opts.headroom ?? 0.95;
  const budget = opts.maxBytes * headroom;
  const maxFps = Math.max(minFps, opts.maxFps);
  const sampleSec = Math.min(opts.durationSec, opts.sampleSec ?? 4);
  const sampleIsWhole = sampleSec >= opts.durationSec - 1e-6;
  const scale = opts.durationSec / sampleSec;

  let encodes = 0;
  let lastFinal: { quality: number; fps: number; bytes: number } | null = null;
  const run = async (quality: number, fps: number, final: boolean, durationSec: number) => {
    encodes++;
    const bytes = await encode({ quality, fps, durationSec, final });
    if (final) lastFinal = { quality, fps, bytes };
    return bytes;
  };
  const result = (quality: number, fps: number, bytes: number): FitResult => ({
    quality,
    fps,
    bytes,
    withinLimit: bytes <= opts.maxBytes,
    attempts: encodes,
  });

  // 1–2. Probe qualities at full fps (a short clip is its own sample → final).
  const estimates = new Map<number, number>(); // quality → estimated full bytes at maxFps
  let forced: { quality: number; bytes: number } | null = null; // sample underestimated
  for (const q of qualities) {
    const bytes = await run(q, maxFps, sampleIsWhole, sampleSec);
    const estimate = bytes * scale;
    estimates.set(q, estimate);
    if (estimate <= (sampleIsWhole ? opts.maxBytes : budget)) {
      if (sampleIsWhole) return result(q, maxFps, bytes);
      const full = await run(q, maxFps, true, opts.durationSec);
      if (full <= opts.maxBytes) return result(q, maxFps, full);
      forced = { quality: q, bytes: full };
      break;
    }
    // Hopeless at full fps even at the floor? Skip to probing the floors.
    if (estimate > budget * 4 && qualities.indexOf(q) < qualities.length - 2) {
      for (const floor of qualities.slice(-2)) {
        if (!estimates.has(floor)) estimates.set(floor, (await run(floor, maxFps, false, sampleSec)) * scale);
      }
      break;
    }
  }

  // 3. Solve fps. Normally at the floor qualities (prefer the higher one unless
  //    the lower gives ≥ 25 % more fps); if the sample underestimated, from the
  //    real full-clip size instead.
  const solve = (fullBytes: number) => roundFps((maxFps * budget) / fullBytes);
  let quality: number;
  let fps: number;
  if (forced) {
    quality = forced.quality;
    fps = solve(forced.bytes);
  } else {
    const [floorQ, lowestQ] = [qualities.at(-2) as number, qualities.at(-1) as number];
    const fpsFloor = solve(estimates.get(floorQ) as number);
    const fpsLowest = solve(estimates.get(lowestQ) as number);
    quality = fpsLowest >= fpsFloor * 1.25 ? lowestQ : floorQ;
    fps = quality === lowestQ ? fpsLowest : fpsFloor;
  }
  fps = Math.min(maxFps, Math.max(minFps, fps));

  // Encode the whole clip; shrink fps (proportionally, at least one step) until it fits.
  for (let i = 0; i < 5; i++) {
    const bytes = await run(quality, fps, true, opts.durationSec);
    if (bytes <= opts.maxBytes) return result(quality, fps, bytes);
    let next = roundFps(fps * (budget / bytes) * 0.97);
    if (next >= fps) next = fps <= 2 ? fps - 0.5 : fps - 1;
    if (next < minFps) {
      if (quality > 5) {
        quality = 5; // last resort at the fps floor
        fps = minFps;
        continue;
      }
      break;
    }
    fps = next;
  }
  const last = lastFinal as { quality: number; fps: number; bytes: number } | null;
  return last ? result(last.quality, last.fps, last.bytes) : result(quality, fps, Number.POSITIVE_INFINITY);
}
