/**
 * WhatsApp sticker limits. Centralized because the sound-sticker format is
 * not officially documented and may change. See INVESTIGACION.md §2–§4.
 */
export const STICKER_LIMITS = {
  /** Canvas side in px (square). */
  size: 512,
  /** Max bytes for an animated WebP (official Business Platform doc). */
  maxAnimatedBytes: 500 * 1024,
  /** Max bytes for a static WebP. */
  maxStaticBytes: 100 * 1024,
  /** Default clip length in seconds (matches native video→sticker audio). */
  defaultDurationSec: 5,
  /** Max audio length for image-based sound stickers. */
  maxImageAudioSec: 10,
  /** Default and minimum frame rate for animated output. */
  defaultFps: 15,
  minFps: 10,
} as const;

export type FitMode = "pad" | "crop";

/** Default fit: transparent padding keeps the whole frame visible. */
export const DEFAULT_FIT: FitMode = "pad";
