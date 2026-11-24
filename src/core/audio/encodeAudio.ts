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
    `${opts.bitrateKbps ?? 48}k`,
    "-application",
    "audio",
    "-f",
    "ogg",
    opts.output,
  ];
}

export async function encodeAudio(opts: EncodeAudioOptions): Promise<void> {
  await run(ffmpegPath(), buildAudioArgs(opts));
}
