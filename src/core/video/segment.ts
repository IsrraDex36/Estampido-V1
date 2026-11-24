import { STICKER_LIMITS } from "../../config/limits.js";
import { UserInputError } from "../errors.js";

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
  if (startSec < 0) throw new UserInputError(`El inicio debe ser ≥ 0 (recibido ${startSec}).`);
  if (durationSec <= 0) throw new UserInputError(`La duración debe ser > 0 (recibido ${durationSec}).`);
  if (sourceDurationSec > 0 && startSec >= sourceDurationSec) {
    throw new UserInputError(
      `El inicio (${startSec} s) está fuera del video (dura ${sourceDurationSec.toFixed(2)} s).`,
    );
  }
  const remaining = sourceDurationSec > 0 ? sourceDurationSec - startSec : durationSec;
  return { startSec, durationSec: Math.min(durationSec, remaining) };
}
