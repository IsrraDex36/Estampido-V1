import { stat } from "node:fs/promises";

export interface EncodeAttempt {
  quality: number;
  fps: number;
}

export interface FitResult extends EncodeAttempt {
  bytes: number;
  withinLimit: boolean;
  attempts: number;
}

/**
 * Quality/fps ladder, best-looking first. Duration is never touched so audio
 * stays in sync.
 */
export const DEFAULT_LADDER: readonly EncodeAttempt[] = [
  { quality: 75, fps: 15 },
  { quality: 60, fps: 15 },
  { quality: 50, fps: 12 },
  { quality: 40, fps: 12 },
  { quality: 30, fps: 10 },
  { quality: 20, fps: 10 },
  { quality: 10, fps: 8 },
];

/**
 * For long clips (> 10 s): sizes grow ~linearly with frame count, so fps must
 * drop much further (down to one frame every 2 s) to fit 500 KB.
 * EXPERIMENTAL (3-minute sound sticker tests).
 */
export const LONG_LADDER: readonly EncodeAttempt[] = [
  { quality: 60, fps: 10 },
  { quality: 50, fps: 8 },
  { quality: 50, fps: 5 },
  { quality: 40, fps: 4 },
  { quality: 30, fps: 3 },
  { quality: 25, fps: 2 },
  { quality: 20, fps: 1 },
  { quality: 15, fps: 1 },
  { quality: 10, fps: 0.5 },
  { quality: 5, fps: 0.5 },
];

export const ladderFor = (durationSec: number): readonly EncodeAttempt[] =>
  durationSec > 10 ? LONG_LADDER : DEFAULT_LADDER;

/**
 * Encode with successive ladder steps until the output fits `maxBytes`.
 * Steps whose size — estimated from the last attempt scaled by fps — would
 * still be over 2× the budget are skipped (never the last one), saving whole
 * encodes on long clips.
 * `encode` must (over)write `output`. Returns the first fitting attempt, or
 * the smallest one (withinLimit=false) if none fit — last step leaves its
 * file on disk, which is the smallest by construction.
 */
export async function fitToSize(
  encode: (attempt: EncodeAttempt) => Promise<void>,
  output: string,
  maxBytes: number,
  ladder: readonly EncodeAttempt[] = DEFAULT_LADDER,
): Promise<FitResult> {
  if (ladder.length === 0) throw new Error("ladder must not be empty");
  let last: FitResult | undefined;
  let encodes = 0;
  for (const [i, attempt] of ladder.entries()) {
    const isLast = i === ladder.length - 1;
    if (last && !isLast && last.fps > 0 && attempt.fps > 0) {
      const estimate = last.bytes * (attempt.fps / last.fps);
      if (estimate > 2 * maxBytes) continue;
    }
    await encode(attempt);
    encodes++;
    const { size } = await stat(output);
    last = { ...attempt, bytes: size, withinLimit: size <= maxBytes, attempts: encodes };
    if (last.withinLimit) return last;
  }
  return last as FitResult;
}
