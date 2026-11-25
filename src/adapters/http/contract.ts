/**
 * HTTP API contract shared with the web client (type-only import from
 * web/ via the `@contract` path alias). Keep this file dependency-free.
 */
export type FitMode = "pad" | "crop";
/** "pad" bars: transparent, a blurred copy of the frame, or "#rrggbb". */
export type StickerBackground = "transparent" | "blur" | `#${string}`;
export type MediaKind = "video" | "animated" | "image";

/** Multipart: `media` (video, GIF or image; legacy name `video`) + optional `audio`. */
export interface ConvertRequestFields {
  /** Segment start in the source (videos/GIFs). */
  startSec: number;
  /** Video: clip, GIF: sound (≤ API_LIMITS.maxDurationSec). Image: sound (≤ maxImageAudioSec). Omit → server default. */
  durationSec?: number;
  fit: FitMode;
  background?: StickerBackground;
  /** "crop" framing: 0..1 across the overflow (0.5 = centered). */
  cropX?: number;
  cropY?: number;
  /** "crop" zoom, 1..4 (1 = just fill). */
  cropZoom?: number;
  includeAudio: boolean;
  /** Start offset inside the replacement audio file (multipart field `audio`). */
  audioStartSec: number;
  /** Length of the replacement sound; omit → as long as the sticker. */
  audioDurationSec?: number;
  /** Experimental: lift the 500 KB cap up to API_LIMITS.maxExperimentalKb. */
  hq?: boolean;
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
    /** Volume boost applied to quiet sound (dB), if any. */
    gainDb?: number;
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
  /** The bot's number (digits) — users send their link code to it via wa.me. */
  botNumber?: string | null;
  /** Owner's local mode: sending without a link goes to the bot's own chat. */
  selfSend?: boolean;
}

/** Header carrying the browser's random id (the API hashes it; never stored raw). */
export const CLIENT_HEADER = "x-estampido-client";

/** "This browser ↔ my WhatsApp chat" link. */
export type WhatsAppLink =
  | { state: "unlinked" }
  | { state: "pending"; code: string; expiresAt: number; waLink: string | null }
  | { state: "linked"; phone: string; linkedAt: number };

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
  /** Video clip / GIF sound (experimental 180; mirrors STICKER_LIMITS). */
  maxDurationSec: 180,
  /** Experimental "hq" size cap in KB (mirrors STICKER_LIMITS.experimentalMaxBytes). */
  maxExperimentalKb: 5 * 1024,
  /** Sound length for image stickers. */
  maxImageAudioSec: 10,
  minDurationSec: 0.5,
} as const;

// ── Community (phase 1.5, local) ─────────────────────────────────────────────

/** Single source for category ids (server validates, web shows label/emoji). */
export const COMMUNITY_CATEGORIES = [
  { id: "reacciones", label: "Reacciones", emoji: "😮" },
  { id: "memes", label: "Memes", emoji: "😂" },
  { id: "musica", label: "Música", emoji: "🎵" },
  { id: "frases", label: "Frases", emoji: "💬" },
  { id: "doblajes", label: "Voces y doblajes", emoji: "🎙️" },
  { id: "efectos", label: "Efectos de sonido", emoji: "💥" },
  { id: "saludos", label: "Saludos", emoji: "👋" },
  { id: "amor", label: "Amor", emoji: "❤️" },
  { id: "cumple", label: "Cumpleaños", emoji: "🎂" },
  { id: "fiesta", label: "Fiesta", emoji: "🎉" },
  { id: "animales", label: "Animales", emoji: "🐶" },
  { id: "gaming", label: "Gaming", emoji: "🎮" },
  { id: "anime", label: "Anime", emoji: "🌸" },
  { id: "series", label: "Series y TV", emoji: "📺" },
  { id: "deportes", label: "Deportes", emoji: "⚽" },
  { id: "virales", label: "Virales", emoji: "🔥" },
  { id: "otros", label: "Otros", emoji: "✨" },
] as const;
export type CommunityCategory = (typeof COMMUNITY_CATEGORIES)[number]["id"];

export type CommunitySort = "hot" | "new" | "top";
export type CommunityPeriod = "day" | "week" | "all";

export const COMMUNITY_LIMITS = {
  pageSize: 24,
  maxPageSize: 48,
  maxTitle: 60,
  maxTags: 3,
  maxTagLength: 20,
  maxQuery: 80,
} as const;

export interface CommunitySticker {
  id: string;
  title: string;
  category: CommunityCategory;
  tags: string[];
  /** ISO timestamp. */
  createdAt: string;
  animated: boolean;
  stickerUrl: string;
  /** null = silent sticker (no reusable sound). */
  sound: { url: string; durationSec: number } | null;
  /** Times its sound was picked to make another sticker. */
  uses: number;
  /** Community sound it was made with, if any. */
  soundOrigin: string | null;
}

/** A reusable sound = a published sticker's audio. */
export interface CommunitySound {
  id: string;
  title: string;
  category: CommunityCategory;
  url: string;
  durationSec: number;
  uses: number;
  /** Sticker it comes from (for the cover). */
  stickerUrl: string;
  createdAt: string;
}

export interface CommunityPage<T> {
  items: T[];
  /** Opaque; null = no more pages. */
  nextCursor: string | null;
}

export interface PublishRequest {
  resultId: string;
  category: CommunityCategory;
  title?: string;
  tags?: string[];
  /** Required (true) when the sound is the user's own, not a community sound. */
  ownsAudio?: boolean;
  /** Community sound used to make it. */
  soundOrigin?: string | null;
}

export interface CommunityStats {
  stickers: number;
  sounds: number;
  uses: number;
}

/** /api/admin/pairing — bot linking for the owner (token-protected). */
export type AdminPairing =
  | { state: "offline" }
  | { state: "waiting" }
  | { state: "qr"; qrSvg: string }
  | { state: "code"; code: string }
  | { state: "connected"; phone: string };

/** /api/admin/health — watchdog report (token-protected). */
export interface AdminHealth {
  status: "ok" | "degraded" | "down" | "unlinked" | "starting" | "offline";
  since: number | null;
  connected: boolean;
  lastInboundAt: number | null;
  lastProbeOkAt: number | null;
  decryptFailuresRecent: number;
  reconnects24h: number;
  problems: string[];
}
