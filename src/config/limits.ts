/**
 * WhatsApp sticker limits. Centralized because the sound-sticker format is
 * not officially documented and may change. See INVESTIGACION.md §2–§4.
 */
export const STICKER_LIMITS = {
  /** Canvas side in px (square). */
  size: 512,
  /** Max bytes for an animated WebP (official Business Platform doc). */
  maxAnimatedBytes: 500 * 1024,
  /**
   * EXPERIMENTAL "hq" cap. WhatsApp's rule is 500 KB; tests sending bigger
   * animated stickers (1–5 MB) showed them arriving but stuttering or not
   * moving on many phones, so the experiment is capped at 1 MB and presented
   * as «para descargar».
   */
  experimentalMaxBytes: 1024 * 1024,
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
  /**
   * Longest animation WhatsApp plays (official sticker guide: total ≤ 10 s; it
   * then stops on the first frame). Longer clips still convert, but freeze in
   * the chat while their sound keeps going.
   */
  whatsappMaxAnimationSec: 10,
  /** Target frame rate for animated stickers. */
  defaultFps: 15,
  /**
   * Frame-rate STANDARD: an animated sticker never goes under this while
   * detail/quality can still be lowered (sources slower than this keep their
   * own rate). Only clips too long for the byte limit drop below it, with a warning.
   */
  standardFps: 14,
  /** Absolute floor for those over-long clips. */
  minFps: 0.5,
} as const;

export type FitMode = "pad" | "crop";

/**
 * What fills the empty area in "pad" mode: transparent, a blurred copy of the
 * frame, or a solid "#rrggbb" color.
 */
export type StickerBackground = "transparent" | "blur" | `#${string}`;

/**
 * "crop" framing: where the square sits (0..1 across the overflow, 0.5 =
 * centered) and how much to zoom in (1 = just fill).
 */
export interface CropFrame {
  x: number;
  y: number;
  zoom: number;
}

/** Default fit: transparent padding keeps the whole frame visible. */
export const DEFAULT_FIT: FitMode = "pad";

/** Input limits shared by every adapter (HTTP, bot, CLI). */
export const INPUT_LIMITS = {
  /** Max size of an uploaded/downloaded source video. */
  maxVideoBytes: 50 * 1024 * 1024,
  /** Max size of a replacement audio file. */
  maxAudioBytes: 20 * 1024 * 1024,
  /**
   * Max picture side and total pixels. A tiny file can declare a gigantic
   * picture («decompression bomb») that eats all the memory when decoded.
   * 8K covers every real phone photo/video.
   */
  maxSidePx: 8_192,
  maxPixels: 8_192 * 8_192,
} as const;
