import type { FitResult } from "./fitToSize.js";

/**
 * Size fitting for animated stickers with a frame-rate STANDARD.
 *
 * Every animated sticker aims at 15 fps and never goes under the standard
 * (14 fps) while there is another way to save bytes. The levers, in order:
 *
 * 1. libwebp quality (75 → 30) at full detail.
 * 2. Detail: the 512×512 canvas is kept (WhatsApp requires it), but the
 *    picture is drawn from a smaller image (448 → 256 px). A sticker shows at
 *    ~190 px in the chat, so this is barely visible, and it saves far more
 *    than dropping quality further (measured: 10 s busy clip at 15 fps,
 *    512 px q20 = 616 KB, 256 px q5 = 418 KB).
 * 3. Only if even the lightest look can't hold 14 fps (long clips) does the
 *    frame rate go below the standard; the result is flagged so the user is
 *    told why and how to fix it (shorter clip or «hq»).
 *
 * Size grows ~linearly with fps × duration, so each look is probed once on a
 * short sample (≤ 4 s) at full fps and the fps it can afford is solved from
 * that. The looks are ordered lightest-last, so a binary search finds the
 * best one that keeps the standard in ~4 probes.
 */
export interface EncodeRequest {
  quality: number;
  fps: number;
  /** Side (px) of the image the 512 canvas is drawn from; 512 = full detail. */
  detail: number;
  /** Seconds to encode (a probe sample or the whole clip). */
  durationSec: number;
  /** true = write the final output; false = scratch probe file. */
  final: boolean;
}

/** Encodes and returns the produced size in bytes. */
export type SizedEncoder = (req: EncodeRequest) => Promise<number>;

export interface Look {
  quality: number;
  detail: number;
}

/** Best-looking first; each one lighter than the previous. */
export const DEFAULT_LOOKS: readonly Look[] = [
  { quality: 75, detail: 512 },
  { quality: 60, detail: 512 },
  { quality: 45, detail: 512 },
  { quality: 30, detail: 512 },
  { quality: 30, detail: 448 },
  { quality: 30, detail: 384 },
  { quality: 20, detail: 384 },
  { quality: 20, detail: 320 },
  { quality: 12, detail: 320 },
  { quality: 12, detail: 256 },
  { quality: 5, detail: 256 },
];

export interface FpsFirstOptions {
  durationSec: number;
  /** Highest useful fps (source fps cap; never upsample). */
  maxFps: number;
  maxBytes: number;
  /** The standard: don't go under this fps while a lighter look exists. */
  standardFps?: number;
  /** Absolute floor when even the lightest look can't hold the standard. */
  minFps?: number;
  looks?: readonly Look[];
  sampleSec?: number;
  /** Aim slightly under the limit so the final encode rarely overshoots. */
  headroom?: number;
}

export interface AnimatedFit extends FitResult {
  detail: number;
  /** true = fps ended under the standard (the clip is too long for 500 KB). */
  belowStandard: boolean;
}

/** Round fps down to a clean value: 0.5 steps below 2, integers above. */
export const roundFps = (fps: number): number => (fps < 2 ? Math.floor(fps * 2) / 2 : Math.floor(fps));

export async function fitFpsFirst(encode: SizedEncoder, opts: FpsFirstOptions): Promise<AnimatedFit> {
  const looks = opts.looks ?? DEFAULT_LOOKS;
  const minFps = opts.minFps ?? 0.5;
  const maxFps = Math.max(minFps, opts.maxFps);
  // A 10 fps GIF keeps its 10 fps: the standard never upsamples.
  const standard = Math.min(opts.standardFps ?? 14, maxFps);
  const headroom = opts.headroom ?? 0.95;
  const budget = opts.maxBytes * headroom;
  const sampleSec = Math.min(opts.durationSec, opts.sampleSec ?? 4);
  const sampleIsWhole = sampleSec >= opts.durationSec - 1e-6;
  const scale = opts.durationSec / sampleSec;

  let encodes = 0;
  let lastFinal: { look: Look; fps: number; bytes: number } | null = null;
  const run = async (look: Look, fps: number, final: boolean, durationSec: number) => {
    encodes++;
    const bytes = await encode({ quality: look.quality, detail: look.detail, fps, durationSec, final });
    if (final) lastFinal = { look, fps, bytes };
    return bytes;
  };
  const result = (look: Look, fps: number, bytes: number): AnimatedFit => ({
    quality: look.quality,
    detail: look.detail,
    fps,
    bytes,
    withinLimit: bytes <= opts.maxBytes,
    belowStandard: fps < standard,
    attempts: encodes,
  });

  // ── 1. Probe: estimated full-clip bytes of a look at maxFps (memoized). ──
  const estimates = new Map<number, number>();
  const estimate = async (i: number): Promise<number> => {
    const known = estimates.get(i);
    if (known !== undefined) return known;
    const bytes = (await run(looks[i] as Look, maxFps, sampleIsWhole, sampleSec)) * scale;
    estimates.set(i, bytes);
    return bytes;
  };
  /** fps this look can afford within the budget (capped at maxFps). */
  const affordable = (bytesAtMax: number, target = budget) =>
    Math.min(maxFps, roundFps((maxFps * target) / bytesAtMax));
  // A short clip's probe IS the real file: judge it against the real limit.
  const target = sampleIsWhole ? opts.maxBytes : budget;
  const keeps = async (i: number) => affordable(await estimate(i), target) >= standard;

  // ── 2. Best look that keeps the standard: try the best one, then binary search. ──
  let pick = -1;
  if (await keeps(0)) pick = 0;
  else if (await keeps(looks.length - 1)) {
    let [lo, hi] = [0, looks.length - 1]; // lo fails, hi keeps
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (await keeps(mid)) hi = mid;
      else lo = mid;
    }
    pick = hi;
  }

  let index = pick === -1 ? looks.length - 1 : pick;
  let fps = Math.max(minFps, affordable(await estimate(index), target));
  if (pick !== -1) fps = Math.max(standard, fps);
  // Between the standard and the target: one step lighter that reaches the
  // target fps wins (15 fps at q60 beats 14 fps at q75 — same look, smoother).
  if (pick !== -1 && fps < maxFps && index + 1 < looks.length) {
    const lighter = affordable(await estimate(index + 1), target);
    if (lighter >= maxFps) {
      index++;
      fps = maxFps;
    }
  }

  // Short clip already encoded exactly like this and within the limit → done.
  const done = lastFinal as { look: Look; fps: number; bytes: number } | null;
  if (sampleIsWhole && done && done.look === looks[index] && done.fps === fps && done.bytes <= opts.maxBytes) {
    return result(done.look, fps, done.bytes);
  }

  // ── 3. Encode the whole clip; if it overshoots, lighten first, fps last. ──
  for (let i = 0; i < 8; i++) {
    const look = looks[index] as Look;
    const bytes = await run(look, fps, true, opts.durationSec);
    if (bytes <= opts.maxBytes) return result(look, fps, bytes);
    const shrunk = roundFps(fps * (budget / bytes) * 0.97);
    if (fps > standard) {
      fps = Math.max(standard, Math.min(shrunk, fps - 1)); // down to the standard
    } else if (index < looks.length - 1) {
      index++; // lighter look, same fps
    } else {
      let next = Math.min(shrunk, fps <= 2 ? fps - 0.5 : fps - 1);
      if (next < minFps) break;
      next = Math.max(minFps, next);
      fps = next;
    }
  }
  const last = lastFinal as { look: Look; fps: number; bytes: number } | null;
  return last ? result(last.look, last.fps, last.bytes) : result(looks[index] as Look, fps, Number.POSITIVE_INFINITY);
}
