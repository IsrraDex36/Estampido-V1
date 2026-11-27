/**
 * HTTP API contract shared with the web client (type-only import from
 * web/ via the `@contract` path alias). Keep this file dependency-free.
 */
export type FitMode = "pad" | "crop";
/** "pad" bars: transparent, a blurred copy of the frame, or "#rrggbb". */
export type StickerBackground = "transparent" | "blur" | `#${string}`;
export type MediaKind = "video" | "animated" | "image";
/** Sticker pack metadata when the user leaves it empty (mirrors core DEFAULT_METADATA). */
export const STICKER_DEFAULTS = { packName: "Busca o crea más en", publisher: "estampido.isrradev.com" } as const;

/** Fixed «author» line of stickers sent as part of a pack (the app's mark; not editable). */
export const PACK_STICKER_PUBLISHER = "Crea más en estampido.isrradev.com";

/** Voice effects for the sound (mirrors core/audio/voice.ts, asserted by tests). */
export const VOICE_EFFECTS = [
  "ardilla",
  "monstruo",
  "robot",
  "radio",
  "alien",
  "cueva",
  "eco",
  "reversa",
  "megafono",
  "videojuego",
  "fantasma",
  "mareado",
  "coro",
  "agua",
] as const;
export type VoiceEffect = (typeof VOICE_EFFECTS)[number];
/** Picture color filters (mirrors core/frame/adjust.ts, asserted by tests). */
export const COLOR_LOOKS = [
  "bn",
  "vivo",
  "retro",
  "frio",
  "calido",
  "noir",
  "cine",
  "suave",
  "negativo",
  "rosa",
] as const;
export type ColorLook = (typeof COLOR_LOOKS)[number];

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
  /** Effect on the sticker's sound. */
  voice?: VoiceEffect;
  /** Color filter for the picture. */
  look?: ColorLook;
  /** Mirror the picture horizontally. */
  flip?: boolean;
}

export interface StickerMetadataView {
  packId: string;
  packName: string;
  publisher: string;
  emojis: string[];
}

export interface ConvertResponse {
  id: string;
  /** Will it play right in WhatsApp? `issues` explain why not (Spanish, user-facing). */
  whatsapp: { ok: boolean; issues: string[] };
  kind: MediaKind;
  sticker: {
    url: string;
    animated: boolean;
    bytes: number;
    maxBytes: number;
    withinLimit: boolean;
    quality: number;
    fps: number;
    /** Animated: side (px) of the picture behind the 512 canvas (512 = full detail). */
    detail?: number;
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

/** The bot's sending budget: limits (warm-up) and what was already sent. */
export interface SendPace {
  perMinute: number;
  perHour: number;
  lastMinute: number;
  lastHour: number;
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
  /** Outgoing pace right now (warm-up limits and recent volume), to estimate long sends. */
  pace?: SendPace;
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
  /** native = sound sticker · separate = sticker + voice note (native failed) · sticker = no sound. */
  delivered: "native" | "separate" | "sticker";
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
  maxExperimentalKb: 1024,
  /** Sound length for image stickers. */
  maxImageAudioSec: 10,
  minDurationSec: 0.5,
  /** Optional multipart `overlay`: transparent PNG (meme text) drawn over the sticker. */
  maxOverlayBytes: 2 * 1024 * 1024,
  maxOverlaySide: 2048,
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

/** A community tag: letters (any language), digits, - and _. Shared by the API and the web form. */
export const COMMUNITY_TAG_RE = /^[\p{L}\p{N}_-]+$/u;

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
  /** false = published as «solo el sonido»: not in the sticker feed, only under «Sonidos». */
  listed: boolean;
  /** Times people saved it (★ favorites). */
  saves: number;
  /** Times people took it to their phone: sent to their WhatsApp or downloaded (once per person a day). */
  downloads: number;
  /** Who published it (null: anonymous, from before accounts). */
  creator: CreatorRef | null;
  /** Only its owner ever sees it true: hidden while reports are reviewed (or by the admin). */
  hidden: boolean;
}

// ── Moderation ─────────────────────────────────────────────────────────────

export const REPORT_REASONS = [
  { id: "spam", label: "Spam o publicidad" },
  { id: "ofensivo", label: "Ofensivo, odio o acoso" },
  { id: "sexual", label: "Contenido sexual" },
  { id: "violencia", label: "Violencia o algo peligroso" },
  { id: "derechos", label: "No es suyo (derechos de autor)" },
  { id: "otro", label: "Otro motivo" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["id"];
export const REPORT_NOTE_MAX = 200;
/** Distinct people reporting a sticker before it's hidden pending review. */
export const REPORT_HIDE_THRESHOLD = 3;

export interface ReportRequest {
  reason: ReportReason;
  note?: string;
}

/** POST /api/community/stickers/:id/report */
export interface ReportResponse {
  /** false = this person had already reported it (nothing changed). */
  reported: boolean;
}

/** One reported sticker in the /admin review queue. */
export interface AdminReportItem {
  sticker: CommunitySticker & { reports: number };
  /** How many people chose each reason. */
  reasons: Partial<Record<ReportReason, number>>;
  /** Written notes, newest first. */
  notes: { reason: ReportReason; note: string; createdAt: string }[];
  latestAt: string;
  /** Its creator is blocked. */
  creatorBanned: boolean;
}

export interface AdminReports {
  items: AdminReportItem[];
}

// ── Accounts & creators (login with WhatsApp) ──────────────────────────────

/** Avatar = one of these emojis on one of these colors ("🐸 lime"). */
export const AVATAR_EMOJIS = [
  "🐸",
  "🐱",
  "🐶",
  "🦊",
  "🐼",
  "🐵",
  "🦄",
  "🐙",
  "👾",
  "🤖",
  "👻",
  "🎧",
  "🔥",
  "⭐",
  "🍕",
  "🌮",
] as const;
export const AVATAR_COLORS = ["lime", "pink", "sky", "amber", "violet", "coral"] as const;
export type AvatarColor = (typeof AVATAR_COLORS)[number];

/** Public handle: 3–20 lowercase letters, digits or _. */
export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
export const PROFILE_LIMITS = { displayName: 40, bio: 160 } as const;
/** DELETE /api/me body must say exactly this. */
export const DELETE_ACCOUNT_CONFIRM = "BORRAR MI CUENTA";

/** What a sticker shows about its creator. */
export interface CreatorRef {
  handle: string;
  displayName: string;
  /** "emoji color" (see AVATAR_EMOJIS / AVATAR_COLORS). */
  avatar: string;
}

export interface CreatorStats {
  /** Published stickers (incl. «solo sonido»). */
  stickers: number;
  /** Times their sounds were reused. */
  uses: number;
  saves: number;
  sends: number;
}

export interface CreatorProfile extends CreatorRef {
  bio: string;
  /** ISO timestamp. */
  createdAt: string;
  stats: CreatorStats;
  /** People following this creator. */
  followers: number;
  /** Only with a session: whether the viewer follows them. */
  followedByMe?: boolean;
}

/** The signed-in user (GET /api/me). */
export interface Me extends CreatorProfile {
  id: string;
  /** "…5678": only ever shown to its owner. */
  phone: string;
}

export interface MeUpdate {
  handle?: string;
  displayName?: string;
  bio?: string;
  avatar?: string;
}

/** Saved ids, newest first (GET /api/me/favorites/ids). */
export interface FavoriteIds {
  stickers: string[];
  sounds: string[];
}

export type FavoriteKind = "sticker" | "sound";

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

/**
 * Trends grouped for browsing (one request): the hottest right now, then one
 * shelf per category, busiest first. Empty categories are left out.
 */
export interface CommunityTrending {
  hot: CommunitySticker[];
  /** Newest first (the «Recién agregados» shelf). */
  recent: CommunitySticker[];
  shelves: { category: CommunityCategory; items: CommunitySticker[] }[];
}

export interface CommunityPage<T> {
  items: T[];
  /** Opaque; null = no more pages. */
  nextCursor: string | null;
}

/**
 * What a publish shares: the sticker with its sound (default), only the
 * sticker (silent, no rights needed), or only the sound (listed under
 * «Sonidos», the sticker is just its cover).
 */
export type PublishShare = "both" | "sticker" | "sound";
export const PUBLISH_SHARES: readonly PublishShare[] = ["both", "sticker", "sound"];

export interface PublishRequest {
  resultId: string;
  /** Default "both". */
  share?: PublishShare;
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
/** Typed by the owner to confirm «Desvincular bot» in /admin. */
export const ADMIN_UNLINK_CONFIRM = "DESVINCULAR";

export type AdminPairing =
  | { state: "offline" }
  | { state: "waiting" }
  | { state: "qr"; qrSvg: string }
  | { state: "code"; code: string }
  | { state: "connected"; phone: string }
  /** WhatsApp refuses the bot's number (restricted/banned); the bot retries slowly. */
  | { state: "blocked"; retryAt: number }
  /** The owner's bot number is off (SVA_ADMIN_BOT); not needed for anything. */
  | { state: "disabled" };

/** /api/admin/health — watchdog report (token-protected). */
/** Owner moderation view of the community (every sticker, newest first; includes «solo el sonido»). */
export interface AdminCommunity {
  items: (CommunitySticker & { sends: number; plays: number; reports: number })[];
  usedBytes: number;
}

/** DELETE /api/admin/community body: must say exactly this to wipe everything. */
export const ADMIN_WIPE_CONFIRM = "BORRAR TODO";

export interface AdminHealth {
  status: "ok" | "degraded" | "down" | "unlinked" | "starting" | "offline";
  since: number | null;
  connected: boolean;
  lastInboundAt: number | null;
  lastProbeOkAt: number | null;
  decryptFailuresRecent: number;
  reconnects24h: number;
  problems: string[];
  /** Outgoing volume and warm-up of the bot's number (newer bots). */
  outbound?: {
    lastMinute: number;
    lastHour: number;
    last24h: number;
    warmupDay: number | null;
    limits: { perMinute: number; perHour: number };
  };
}

// ── Feedback box ───────────────────────────────────────────────────────────

export const FEEDBACK_KINDS = [
  { id: "idea", label: "Idea", emoji: "💡" },
  { id: "problema", label: "Problema", emoji: "🐞" },
  { id: "otro", label: "Otro", emoji: "💬" },
] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]["id"];
export const FEEDBACK_LIMITS = { minMessage: 5, maxMessage: 1000, maxContact: 120, perHour: 5 } as const;
export type FeedbackStatus = "nuevo" | "leido" | "hecho";

export interface FeedbackRequest {
  kind: FeedbackKind;
  message: string;
  /** Optional way to reply (email, @usuario…). Not needed when signed in. */
  contact?: string;
  /** Where it was sent from (path only). */
  page?: string;
  /** Web version, for bug reports. */
  app?: string;
  /** Honeypot: humans never see or fill it. */
  website?: string;
}

export interface FeedbackItem {
  id: string;
  kind: FeedbackKind;
  message: string;
  contact: string;
  page: string;
  app: string;
  /** Signed-in sender. */
  author: CreatorRef | null;
  status: FeedbackStatus;
  createdAt: string;
}

export interface AdminFeedback {
  items: FeedbackItem[];
  /** Unread count (badge). */
  unread: number;
}

// ── Conversion jobs (queue) ────────────────────────────────────────────────

/** Error codes the web turns into a helpful card (see web ConvertErrorCard). */
export type ConvertErrorCode =
  | "busy" // 503: the line is full — Retry-After says when to come back
  | "one_at_a_time" // 429: this browser already has a sticker in progress
  | "timeout" // 504: took too long (very long or heavy clip)
  | "upload_failed" // 400: the upload was cut off
  | "too_large" // 413
  | "bad_type" // 415
  | "missing_file" // 400
  | "bad_options" // 400
  | "unprocessable" // 422: the file couldn't be read / converted
  | "expired" // 404: the job is gone (server restarted or >30 min)
  | "internal" // 500
  | "signin_required" // 401: defense mode — only linked WhatsApp accounts can create for now
  | "network" // client side: no connection
  | "aborted"; // client side: cancelled

/** POST /api/convert/slot: a place in line, BEFORE uploading (send it as SLOT_HEADER). */
export interface ConvertSlot {
  slot: string;
  /** Seconds it'd wait now before starting. */
  etaSec: number;
  /** Use it within this time or the place is given to someone else. */
  expiresInSec: number;
}
export const SLOT_HEADER = "x-estampido-slot";

/** 202 from POST /api/convert?async=1 */
export interface ConvertJobAccepted {
  jobId: string;
  /** 1-based place in line; 0 = starting now. */
  position: number;
  etaSec: number;
}

/** GET /api/jobs/:id */
export type ConvertJobStatus =
  | { state: "queued"; position: number; etaSec: number }
  | { state: "running"; elapsedSec: number; expectedSec: number }
  | { state: "done"; result: ConvertResponse }
  | { state: "failed"; error: { code: ConvertErrorCode; message: string; status: number; retryAfterSec?: number } }
  | { state: "cancelled" };

/** GET /api/queue: how busy the converter is right now. */
export interface QueueInfo {
  active: number;
  waiting: number;
  concurrency: number;
  /** Seconds a new sticker would wait before starting. */
  etaSec: number;
  /** Typical seconds per sticker lately. */
  avgJobSec: number;
  /** New stickers are being turned away right now. */
  full: boolean;
}

// ── Packs (curated lists of community stickers) ───────────────────────────

/** WhatsApp packs hold up to 30 stickers. */
export const PACK_LIMITS = { maxStickers: 30, maxPacks: 20, maxName: 40 } as const;

export interface PackSummary {
  id: string;
  name: string;
  count: number;
  /** Up to 4 sticker URLs for the cover mosaic. */
  covers: string[];
  owner: CreatorRef;
  /** ISO timestamp. */
  updatedAt: string;
}

export interface PackDetail extends PackSummary {
  items: CommunitySticker[];
  /** The viewer owns it (can edit). */
  mine: boolean;
}
