/**
 * Animated-sticker timeline: which frame shows at a given time. The audio
 * clock drives it, so picture and sound stay locked together. Pure.
 */
export interface FrameTimeline {
  /** Start of each frame (ms). */
  starts: number[];
  /** Whole loop (ms). */
  total: number;
}

/** Frame durations (ms; ≤ 0 or missing → 100 ms, like browsers do) → timeline. */
export function buildTimeline(durationsMs: number[]): FrameTimeline {
  const starts: number[] = [];
  let t = 0;
  for (const d of durationsMs) {
    starts.push(t);
    t += d > 0 && Number.isFinite(d) ? d : 100;
  }
  return { starts, total: t };
}

/** Frame index at `tMs`, looping (stickers loop). Binary search. */
export function frameAt({ starts, total }: FrameTimeline, tMs: number): number {
  if (starts.length <= 1 || total <= 0) return 0;
  const t = ((tMs % total) + total) % total;
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] ?? 0) <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
