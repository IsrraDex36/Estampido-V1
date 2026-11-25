import { ffmpegPath, run } from "../../utils/ffmpeg.js";

export interface EncodeAudioOptions {
  /** Source file (the video itself, or a replacement audio file). */
  input: string;
  output: string;
  startSec: number;
  durationSec: number;
  /** Opus bitrate in kbps. */
  bitrateKbps?: number;
}

/**
 * Extract and trim audio → Ogg/Opus mono 48 kHz (same family as WhatsApp voice
 * notes; real sound-sticker codec still unverified, see INVESTIGACION.md §3).
 */
export function buildAudioArgs(opts: EncodeAudioOptions): string[] {
  return [
    "-hide_banner",
    "-v",
    "error",
    "-y",
    "-ss",
    String(opts.startSec),
    "-t",
    String(opts.durationSec),
    "-i",
    opts.input,
    "-vn",
    "-map",
    "0:a:0",
    "-ac",
    "1",
    "-ar",
    "48000",
    "-c:a",
    "libopus",
    "-b:a",
    // Long sounds (> 30 s, experimental) at 32 kbps, constrained VBR so the
    // size stays predictable (free VBR overshot to ~48 kbps on tonal input).
    `${opts.bitrateKbps ?? (opts.durationSec > 30 ? 32 : 48)}k`,
    ...(opts.durationSec > 30 ? ["-vbr", "constrained"] : []),
    "-application",
    "audio",
    "-f",
    "ogg",
    opts.output,
  ];
}

export async function encodeAudio(opts: EncodeAudioOptions): Promise<void> {
  await run(ffmpegPath(), buildAudioArgs(opts), { timeoutMs: Math.max(120_000, opts.durationSec * 2_000) });
}
