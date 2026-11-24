/**
 * HTTP API contract shared with the web client (type-only import from
 * web/ via the `@contract` path alias). Keep this file dependency-free.
 */
export type FitMode = "pad" | "crop";

export interface ConvertRequestFields {
  startSec: number;
  durationSec: number;
  fit: FitMode;
  includeAudio: boolean;
  /** Start offset inside the replacement audio file (multipart field `audio`). */
  audioStartSec: number;
  /** WhatsApp pack metadata; empty → server defaults. */
  includeMetadata: boolean;
  packName?: string;
  publisher?: string;
  /** Comma-separated, up to 3. */
  emojis?: string;
}

export interface StickerMetadataView {
  packId: string;
  packName: string;
  publisher: string;
  emojis: string[];
}

export interface ConvertResponse {
  id: string;
  sticker: {
    url: string;
    bytes: number;
    maxBytes: number;
    withinLimit: boolean;
    quality: number;
    fps: number;
    frames: number;
    durationMs: number;
    attempts: number;
    metadata: StickerMetadataView | null;
  };
  audio: {
    url: string;
    bytes: number;
    codec: "opus";
    origin: "video" | "file";
  } | null;
  source: {
    durationSec: number;
    width: number;
    height: number;
    fps: number;
    hasAudio: boolean;
  };
  segment: { startSec: number; durationSec: number };
  warnings: string[];
  elapsedMs: number;
  /** ISO timestamp after which result files are deleted. */
  expiresAt: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export const API_LIMITS = {
  /** Keep in sync with INPUT_LIMITS in src/config/limits.ts (asserted by tests). */
  maxUploadBytes: 50 * 1024 * 1024,
  maxAudioBytes: 20 * 1024 * 1024,
  maxDurationSec: 5,
  minDurationSec: 0.5,
} as const;
