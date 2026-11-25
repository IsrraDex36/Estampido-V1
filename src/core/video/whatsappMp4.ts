import { ffmpegPath, run } from "../../utils/ffmpeg.js";

/**
 * «Exportar para WhatsApp»: a square MP4 (H.264 + AAC) made from the finished
 * sticker, for WhatsApp's own «Crear sticker» from a gallery video (sound
 * stickers, Android beta as of Nov 2026). WhatsApp keeps ≈5 s of sound for
 * video-based stickers and ≈10 s for still ones, so we cap to that.
 */
export const WHATSAPP_MP4_LIMITS = { animatedSec: 5, staticSec: 10, silentStaticSec: 3, size: 512, fps: 24 } as const;

export interface WhatsAppMp4Options {
  webp: string;
  /** The sticker's sound (Opus), if any. */
  audio?: string;
  audioDurationSec?: number;
  animated: boolean;
  output: string;
}

/** Seconds the MP4 will last. Pure. */
export function whatsappMp4Duration(animated: boolean, audioDurationSec?: number): number {
  const cap = animated ? WHATSAPP_MP4_LIMITS.animatedSec : WHATSAPP_MP4_LIMITS.staticSec;
  if (audioDurationSec && audioDurationSec > 0) return Math.min(cap, Math.round(audioDurationSec * 100) / 100);
  return animated ? cap : WHATSAPP_MP4_LIMITS.silentStaticSec;
}

/** ffmpeg args. Transparency is flattened on white (MP4 has no alpha). Pure. */
export function buildWhatsAppMp4Args(o: WhatsAppMp4Options): string[] {
  const { size, fps } = WHATSAPP_MP4_LIMITS;
  const duration = whatsappMp4Duration(o.animated, o.audio ? o.audioDurationSec : undefined);
  const input = o.animated ? ["-c:v", "webp_anim", "-i", o.webp] : ["-loop", "1", "-i", o.webp];
  // Animated stickers shorter than the sound hold their last frame.
  const frame = `[0:v]${o.animated ? `fps=${fps},` : ""}scale=${size}:${size}:flags=lanczos,format=rgba${o.animated ? `,tpad=stop_mode=clone:stop_duration=${WHATSAPP_MP4_LIMITS.staticSec}` : ""}[f]`;
  const graph = `color=c=white:s=${size}x${size}:r=${fps}[b];${frame};[b][f]overlay=shortest=1:format=auto,format=yuv420p[v]`;
  return [
    "-hide_banner",
    "-v",
    "error",
    "-y",
    ...input,
    ...(o.audio ? ["-i", o.audio] : []),
    "-filter_complex",
    graph,
    "-map",
    "[v]",
    ...(o.audio ? ["-map", "1:a", "-c:a", "aac", "-b:a", "128k", "-ac", "1"] : ["-an"]),
    "-t",
    String(duration),
    "-c:v",
    "libx264",
    "-profile:v",
    "main",
    "-preset",
    "veryfast",
    "-crf",
    "22",
    "-r",
    String(fps),
    "-movflags",
    "+faststart",
    o.output,
  ];
}

export async function buildWhatsAppMp4(o: WhatsAppMp4Options, signal?: AbortSignal): Promise<void> {
  await run(ffmpegPath(), buildWhatsAppMp4Args(o), { signal, timeoutMs: 60_000 });
}
