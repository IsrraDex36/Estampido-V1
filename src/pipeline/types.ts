import type { FitMode } from "../config/limits.js";
import type { StickerMetadata, StickerMetadataInput } from "../core/metadata/stickerExif.js";
import type { MediaKind } from "../core/probe/probe.js";

export interface ReplacementAudio {
  file: string;
  startSec?: number;
}

export interface ConvertOptions {
  /** Video, GIF/animated WebP, or still image. Kind is auto-detected. */
  input: string;
  /** Directory for outputs (must exist). */
  outDir: string;
  /** Base name for output files (no extension). */
  name?: string;
  /** Segment start inside the source (video/animated only). */
  startSec?: number;
  /**
   * Video: clip length (≤ STICKER_LIMITS.maxDurationSec). Animated: sound length (the animation loops).
   * Image: sound length (≤ 10 s). Default: 5 s, or the audio's length for images.
   */
  durationSec?: number;
  fit?: FitMode;
  /**
   * "source" = the input's own sound (videos), "none" = silent, or a
   * replacement file (audio or video) read from its own `startSec`.
   */
  audio?: "source" | "none" | ReplacementAudio;
  /**
   * Treat a video source as a looping animation (e.g. WhatsApp GIFs, which
   * arrive as silent MP4): a replacement sound may then outlast the clip.
   */
  loops?: boolean;
  /**
   * When `durationSec` is omitted: take the whole source (video from
   * `startSec` to its end) — or the whole replacement sound for looping
   * sources — up to STICKER_LIMITS.maxDurationSec, instead of the 5 s default.
   */
  fullLength?: boolean;
  /** Override the size limit (default: 500 KB animated, 100 KB static). */
  maxBytes?: number;
  /** WhatsApp pack/author metadata (EXIF). Defaults applied; `false` = none. */
  metadata?: StickerMetadataInput | false;
}

export interface ConvertResult {
  kind: MediaKind;
  webpPath: string;
  audioPath?: string;
  warnings: string[];
  stats: {
    source: { durationSec: number; width: number; height: number; fps: number; hasAudio: boolean };
    /** Video: clip taken from the source. Image/animated + file: sound segment. */
    segment: { startSec: number; durationSec: number };
    sticker: {
      animated: boolean;
      bytes: number;
      withinLimit: boolean;
      maxBytes: number;
      quality: number;
      /** 0 for static stickers. */
      fps: number;
      frames: number;
      durationMs: number;
      attempts: number;
      metadata: StickerMetadata | null;
    };
    audio?: {
      bytes: number;
      codec: "opus";
      origin: "video" | "file";
      /** Measured length of the produced sound. */
      durationSec: number;
      /** Volume boost applied to quiet sound (dB), if any. */
      gainDb?: number;
    };
    elapsedMs: number;
  };
}
