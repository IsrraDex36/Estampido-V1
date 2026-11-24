import { STICKER_LIMITS } from "../../config/limits.js";

export interface Segment {
  startSec: number;
  durationSec: number;
}

/**
 * Clamp a requested segment to the source length. Throws if the start is
 * outside the source.
 */
export function resolveSegment(
  sourceDurationSec: number,
  startSec = 0,
  durationSec: number = STICKER_LIMITS.defaultDurationSec,
): Segment {
  if (startSec < 0) throw new Error(`start must be ≥ 0 (got ${startSec})`);
  if (durationSec <= 0)
    throw new Error(`duration must be > 0 (got ${durationSec})`);
  if (sourceDurationSec > 0 && startSec >= sourceDurationSec) {
    throw new Error(
      `start ${startSec}s is beyond source duration ${sourceDurationSec.toFixed(2)}s`,
    );
  }
  const remaining =
    sourceDurationSec > 0 ? sourceDurationSec - startSec : durationSec;
  return { startSec, durationSec: Math.min(durationSec, remaining) };
}
