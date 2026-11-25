import { API_LIMITS } from "@contract";
import { type Smoothness, smoothnessFor } from "@/lib/time";
import type { ConverterOptions, InputKind } from "../types";

export const DEFAULT_SEC = 5;
const VIDEO_PRESETS = [3, 5, 10, 30, 60, 120, 180];
const IMAGE_PRESETS = [3, 5, 10];
export const round1 = (n: number) => Math.round(n * 10) / 10;

export interface SegmentModel {
  isImage: boolean;
  isVideo: boolean;
  /** Source length is known (video previews only). */
  known: boolean;
  sourceDuration: number;
  minDuration: number;
  maxDuration: number;
  start: number;
  /** Seconds left after `start` (Infinity when unknown). */
  remaining: number;
  requested?: number;
  /** What will actually be used (clamped to the source). */
  effective?: number;
  end?: number;
  presets: number[];
  smoothness: Smoothness;
  /** The video ends before the requested duration. */
  clipped: boolean;
}

/** Everything the segment UI needs, derived from options + source. Pure. */
export function deriveSegment(options: ConverterOptions, kind: InputKind, sourceDuration?: number): SegmentModel {
  const isImage = kind === "image";
  const isVideo = kind === "video";
  const maxDuration = isImage ? API_LIMITS.maxImageAudioSec : API_LIMITS.maxDurationSec;
  const known = isVideo && sourceDuration !== undefined && Number.isFinite(sourceDuration) && sourceDuration > 0;
  const src = known ? (sourceDuration as number) : 0;
  const start = isImage ? 0 : options.startSec;
  const remaining = known ? Math.max(0, src - start) : Number.POSITIVE_INFINITY;
  const requested = options.durationSec ?? (isImage ? undefined : DEFAULT_SEC);
  const effective = requested === undefined ? undefined : Math.min(requested, remaining);
  return {
    isImage,
    isVideo,
    known,
    sourceDuration: src,
    minDuration: API_LIMITS.minDurationSec,
    maxDuration,
    start,
    remaining,
    requested,
    effective,
    end: effective === undefined ? undefined : start + effective,
    presets: (isImage ? IMAGE_PRESETS : VIDEO_PRESETS).filter((p) => p <= maxDuration),
    smoothness: isVideo && effective !== undefined ? smoothnessFor(effective, options.hq ?? false) : "fluid",
    clipped: requested !== undefined && effective !== undefined && effective < requested - 0.05,
  };
}

/**
 * Two-thumb slider → start/duration. Keeps the span within [min, max],
 * moving the thumb the user isn't dragging. Pure.
 */
export function rangeToSegment(
  [s, e]: [number, number],
  previousStart: number,
  minDuration: number,
  maxDuration: number,
): { startSec: number; durationSec: number } {
  let start = s;
  let end = e;
  if (end - start > maxDuration) {
    if (start !== previousStart) end = start + maxDuration;
    else start = end - maxDuration;
  }
  if (end - start < minDuration) end = start + minDuration;
  return { startSec: round1(start), durationSec: round1(end - start) };
}
