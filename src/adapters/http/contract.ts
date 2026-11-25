/**
 * HTTP API contract shared with the web client (type-only import from
 * web/ via the `@contract` path alias). Keep this file dependency-free.
 */
export type FitMode = "pad" | "crop";
export type MediaKind = "video" | "animated" | "image";

/** Multipart: `media` (video, GIF or image; legacy name `video`) + optional `audio`. */
export interface ConvertRequestFields {
  /** Segment start in the source (videos/GIFs). */
  startSec: number;
  /** Video: clip ≤ 5 s. GIF: sound ≤ 5 s. Image: sound ≤ 10 s. Omit → server default. */
  durationSec?: number;
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
  kind: MediaKind;
  sticker: {
    url: string;
    animated: boolean;
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
    durationSec: number;
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

export interface WhatsAppStatus {
  /** Bot process running (control endpoint reachable). */
  available: boolean;
  /** Bot linked and connected to WhatsApp. */
  connected: boolean;
}

export interface SendToWhatsAppResponse {
  /** native = one sound sticker; sticker = plain sticker (result had no sound). */
  delivered: "native" | "sticker";
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export const API_LIMITS = {
  /** Keep in sync with INPUT_LIMITS in src/config/limits.ts (asserted by tests). */
  maxUploadBytes: 50 * 1024 * 1024,
  maxAudioBytes: 20 * 1024 * 1024,
  /** Video clip / GIF sound. */
  maxDurationSec: 5,
  /** Sound length for image stickers. */
  maxImageAudioSec: 10,
  minDurationSec: 0.5,
} as const;
