/**
 * WhatsApp sticker limits. Centralized because the sound-sticker format is
 * not officially documented and may change. See INVESTIGACION.md §2–§4.
 */
export const STICKER_LIMITS = {
  /** Canvas side in px (square). */
  size: 512,
  /** Max bytes for an animated WebP (official Business Platform doc). */
  maxAnimatedBytes: 500 * 1024,
  /** EXPERIMENTAL "hq" cap: ignore the 500 KB rule to see what WhatsApp does. */
  experimentalMaxBytes: 5 * 1024 * 1024,
  /** Max bytes for a static WebP. */
  maxStaticBytes: 100 * 1024,
  /** Default clip length in seconds (matches native video→sticker audio). */
  defaultDurationSec: 5,
  /**
   * Max clip length accepted by any adapter. EXPERIMENTAL: raised 5 → 180 s to
   * test whether WhatsApp accepts longer sound stickers (native app uses 5 s
   * from video, up to 10 s for images). Revert the experiment commits to go back.
   */
  maxDurationSec: 180,
  /** Max audio length for image-based sound stickers. */
  maxImageAudioSec: 10,
  /** Default and minimum frame rate for animated output. */
  defaultFps: 15,
  minFps: 10,
} as const;

export type FitMode = "pad" | "crop";

/**
 * What fills the empty area in "pad" mode: transparent, a blurred copy of the
 * frame, or a solid "#rrggbb" color.
 */
export type StickerBackground = "transparent" | "blur" | `#${string}`;

/** Default fit: transparent padding keeps the whole frame visible. */
export const DEFAULT_FIT: FitMode = "pad";

/** Input limits shared by every adapter (HTTP, bot, CLI). */
export const INPUT_LIMITS = {
  /** Max size of an uploaded/downloaded source video. */
  maxVideoBytes: 50 * 1024 * 1024,
  /** Max size of a replacement audio file. */
  maxAudioBytes: 20 * 1024 * 1024,
} as const;
