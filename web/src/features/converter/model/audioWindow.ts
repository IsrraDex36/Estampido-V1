/**
 * The replacement sound's "window": which stretch of the audio plays in the
 * sticker. Pure → tested from the root suite.
 */

export interface AudioWindow {
  start: number;
  length: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Normalized peaks (0..1) for `bars` bars, max |sample| per bucket across
 * channels. Samples are strided so a minutes-long file stays cheap.
 */
export function computePeaks(channels: ArrayLike<number>[], bars: number): number[] {
  const length = channels[0]?.length ?? 0;
  if (length === 0 || bars <= 0) return Array.from({ length: Math.max(0, bars) }, () => 0);
  const bucket = length / bars;
  const stride = Math.max(1, Math.floor(bucket / 400));
  const peaks: number[] = [];
  for (let b = 0; b < bars; b++) {
    const from = Math.floor(b * bucket);
    const to = Math.max(from + 1, Math.floor((b + 1) * bucket));
    let max = 0;
    for (const ch of channels) {
      for (let i = from; i < to && i < length; i += stride) {
        const v = Math.abs(ch[i] ?? 0);
        if (v > max) max = v;
      }
    }
    peaks.push(max);
  }
  const top = Math.max(...peaks);
  return top > 0 ? peaks.map((p) => p / top) : peaks;
}

/**
 * Stretch that will sound, clamped to the audio. `wanted` undefined = auto
 * (from start to the end of the audio, up to `maxSec`).
 */
export function clipWindow(total: number, start: number, wanted: number | undefined, maxSec: number): AudioWindow {
  if (!(total > 0)) return { start: 0, length: 0 };
  if (wanted !== undefined) {
    const length = Math.min(wanted, total);
    return { start: round1(clamp(start, 0, total - length)), length };
  }
  const s = clamp(start, 0, total);
  return { start: round1(s), length: Math.min(maxSec, total - s) };
}

/** Start for a pointer at `at` seconds: a fixed window is centered on it; auto starts there. */
export function startFromPointer(at: number, total: number, wanted: number | undefined): number {
  if (!(total > 0)) return 0;
  if (wanted === undefined) return round1(clamp(at, 0, Math.max(0, total - 0.5)));
  const length = Math.min(wanted, total);
  return round1(clamp(at - length / 2, 0, total - length));
}

/** Latest valid start (keyboard End / slider max). */
export function maxStartFor(total: number, wanted: number | undefined): number {
  if (!(total > 0)) return 0;
  return round1(wanted === undefined ? Math.max(0, total - 0.5) : Math.max(0, total - Math.min(wanted, total)));
}
