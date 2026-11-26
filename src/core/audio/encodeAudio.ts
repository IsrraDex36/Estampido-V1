import { ffmpegPath, run } from "../../utils/ffmpeg.js";
import { type VoiceEffect, voiceFilters } from "./voice.js";

export interface EncodeAudioOptions {
  /** Source file (the video itself, or a replacement audio file). */
  input: string;
  output: string;
  startSec: number;
  durationSec: number;
  /** Opus bitrate in kbps. */
  bitrateKbps?: number;
  /** Absolute stream index to use (default: first audio stream). */
  streamIndex?: number;
  /** Peak-normalization gain in dB (0 = untouched). */
  gainDb?: number;
  /** Voice effect (ardilla, monstruo, eco, reversa). */
  voice?: VoiceEffect;
  signal?: AbortSignal;
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
    opts.streamIndex === undefined ? "0:a:0" : `0:${opts.streamIndex}`,
    // Align to the segment start: audio that begins late (or has gaps) is
    // padded with silence instead of shifting earlier than the picture.
    "-af",
    [
      "aresample=async=1:first_pts=0",
      ...voiceFilters(opts.voice),
      ...(opts.gainDb ? [`volume=${opts.gainDb.toFixed(1)}dB`] : []),
      // Gain or an effect (echo adds up) can clip: limit the peaks.
      ...(opts.gainDb || opts.voice ? ["alimiter=limit=0.95"] : []),
    ].join(","),
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
    // Effects like the echo add a tail: keep the sound exactly as long as the segment.
    ...(opts.voice ? ["-t", String(opts.durationSec)] : []),
    "-f",
    "ogg",
    opts.output,
  ];
}

export async function encodeAudio(opts: EncodeAudioOptions): Promise<void> {
  await run(ffmpegPath(), buildAudioArgs(opts), {
    timeoutMs: Math.max(120_000, opts.durationSec * 2_000),
    signal: opts.signal,
  });
}

export interface Loudness {
  /** Peak level in dBFS; null when the segment has no audio samples at all. */
  maxVolumeDb: number | null;
  meanVolumeDb: number | null;
}

/** Parse ffmpeg volumedetect output (stderr). Pure. */
export function parseVolumeDetect(stderr: string): Loudness {
  const pick = (key: string): number | null => {
    const m = new RegExp(`${key}:\\s*(-?inf|-?[\\d.]+) dB`).exec(stderr);
    if (!m) return null;
    return m[1]?.endsWith("inf") ? Number.NEGATIVE_INFINITY : Number(m[1]);
  };
  return { maxVolumeDb: pick("max_volume"), meanVolumeDb: pick("mean_volume") };
}

/** Decode one stream's segment and measure its loudness (no file written). */
export async function analyzeAudio(opts: {
  input: string;
  startSec: number;
  durationSec: number;
  streamIndex?: number;
  signal?: AbortSignal;
}): Promise<Loudness> {
  const { stderr } = await run(
    ffmpegPath(),
    [
      "-hide_banner",
      "-nostats",
      "-ss",
      String(opts.startSec),
      "-t",
      String(opts.durationSec),
      "-i",
      opts.input,
      "-vn",
      "-map",
      opts.streamIndex === undefined ? "0:a:0" : `0:${opts.streamIndex}`,
      "-af",
      "volumedetect",
      "-f",
      "null",
      "-",
    ],
    { timeoutMs: Math.max(60_000, opts.durationSec * 1_000), signal: opts.signal },
  );
  return parseVolumeDetect(stderr);
}
