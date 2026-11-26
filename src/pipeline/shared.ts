import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { INPUT_LIMITS } from "../config/limits.js";
import { analyzeAudio, encodeAudio, type Loudness } from "../core/audio/encodeAudio.js";
import type { VoiceEffect } from "../core/audio/voice.js";
import { CancelledError, throwIfCancelled, UserInputError } from "../core/errors.js";
import { buildStickerExif, resolveMetadata, type StickerMetadata } from "../core/metadata/stickerExif.js";
import { type AudioStreamInfo, type MediaInfo, probe } from "../core/probe/probe.js";
import { embedExif, exifOverhead } from "../core/webp/chunks.js";
import { inspectWebp, type WebpInfo } from "../core/webp/inspect.js";
import type { ConvertOptions, ConvertResult, ReplacementAudio } from "./types.js";

/** ffprobe a user-supplied file; unreadable input is the user's problem, not ours. */
export async function probeUserFile(path: string, what: string, signal?: AbortSignal): Promise<MediaInfo> {
  let info: MediaInfo;
  try {
    info = await probe(path, signal);
  } catch (err) {
    if (err instanceof CancelledError) throw err;
    throw new UserInputError(`No se pudo leer ${what}. ¿Es un archivo válido?`);
  }
  assertSaneSize(info, what);
  return info;
}

/** Refuse pictures too big to decode safely (before any decode). Pure. */
export function assertSaneSize(info: Pick<MediaInfo, "width" | "height">, what = "el archivo"): void {
  const { maxSidePx, maxPixels } = INPUT_LIMITS;
  if (info.width > maxSidePx || info.height > maxSidePx || info.width * info.height > maxPixels) {
    throw new UserInputError(
      `${what[0]?.toUpperCase()}${what.slice(1)} es demasiado grande (${info.width}×${info.height}). Máximo ${maxSidePx} px por lado.`,
    );
  }
}

/** Validate a replacement sound before any costly encode. Returns its probe. */
export async function validateReplacement(audio: ReplacementAudio, signal?: AbortSignal): Promise<MediaInfo> {
  const info = await probeUserFile(audio.file, "el audio", signal);
  if (!info.hasAudio) throw new UserInputError("El archivo de audio elegido no tiene sonido.");
  const start = audio.startSec ?? 0;
  if (info.durationSec > 0 && start >= info.durationSec) {
    throw new UserInputError(
      `El inicio del audio (${start} s) está fuera del archivo (dura ${info.durationSec.toFixed(2)} s).`,
    );
  }
  return info;
}

/** Seconds of sound available in `info` after `start` (Infinity if unknown). */
export const availableAfter = (info: MediaInfo, start: number): number =>
  info.durationSec > 0 ? info.durationSec - start : Number.POSITIVE_INFINITY;

export function assertMaxDuration(durationSec: number | undefined, max: number, what: string): void {
  if (durationSec !== undefined && durationSec > max) {
    throw new UserInputError(`${what} admite máximo ${max} s (pediste ${durationSec}).`);
  }
}

export interface PreparedMetadata {
  metadata: StickerMetadata | null;
  exif: Buffer | null;
  /** Bytes the EXIF chunk will add; subtract from the encode budget. */
  overhead: number;
}

export function prepareMetadata(input: ConvertOptions["metadata"]): PreparedMetadata {
  const metadata = input === false ? null : resolveMetadata(input);
  const exif = metadata ? buildStickerExif(metadata) : null;
  return { metadata, exif, overhead: exif ? exifOverhead(exif) : 0 };
}

/** Embed EXIF (if any) into the encoded WebP on disk; return final bytes + info. */
export async function finalizeWebp(path: string, exif: Buffer | null): Promise<{ bytes: Buffer; info: WebpInfo }> {
  let bytes: Buffer = await readFile(path);
  if (exif) {
    bytes = embedExif(bytes, exif);
    await writeFile(path, bytes);
  }
  return { bytes, info: inspectWebp(bytes) };
}

/** Peak at or below this (dBFS) counts as silence (digital silence is ≈ -91 dB). */
export const SILENCE_DB = -60;
const TARGET_PEAK_DB = -1;
const MAX_GAIN_DB = 20;

/** Peak normalization for quiet sound: lift the peak to -1 dBFS (max +20 dB). Pure. */
export function gainFor(maxVolumeDb: number): number {
  if (maxVolumeDb >= -6) return 0;
  return Math.round(Math.min(MAX_GAIN_DB, TARGET_PEAK_DB - maxVolumeDb) * 10) / 10;
}

export interface SoundSource {
  input: string;
  startSec: number;
  durationSec: number;
  origin: "video" | "file";
  /** Candidate audio streams (default first); empty → let ffmpeg pick. */
  streams: AudioStreamInfo[];
  voice?: VoiceEffect;
}

type AudioStats = NonNullable<ConvertResult["stats"]["audio"]>;
export type SoundOutcome = { audioPath: string; stats: AudioStats } | { warning: string };

const secs = (n: number) => `${n.toFixed(1)} s`;

/**
 * Robust sound extraction. Tries each audio stream (default first) and keeps
 * the first one with real sound in the segment:
 * - undecodable codec → next stream
 * - no samples in the segment (track ends/starts elsewhere) → next stream
 * - digital silence (≤ -60 dB) → next stream (e.g. muted first track)
 * Quiet sound is peak-normalized; the output is re-measured. When nothing
 * usable exists the sticker is still produced and a specific warning returned.
 */
export async function extractSound(
  outDir: string,
  name: string,
  src: SoundSource,
  signal?: AbortSignal,
): Promise<SoundOutcome> {
  const candidates: (AudioStreamInfo | undefined)[] = src.streams.length ? src.streams : [undefined];
  const audioPath = join(outDir, `${name}.ogg`);
  let reason: "undecodable" | "empty" | "silent" = "empty";
  let badCodec: string | undefined;

  for (const stream of candidates) {
    let loud: Loudness;
    try {
      loud = await analyzeAudio({ ...src, streamIndex: stream?.index, signal });
    } catch (err) {
      if (err instanceof CancelledError) throw err;
      if (reason !== "silent") reason = "undecodable";
      badCodec ??= stream?.codec;
      continue;
    }
    if (loud.maxVolumeDb === null) continue; // no samples in this segment
    if (loud.maxVolumeDb <= SILENCE_DB) {
      reason = "silent";
      continue;
    }
    const gainDb = gainFor(loud.maxVolumeDb);
    try {
      await encodeAudio({ ...src, output: audioPath, streamIndex: stream?.index, gainDb, signal });
    } catch (err) {
      if (err instanceof CancelledError) throw err;
      reason = "undecodable";
      badCodec ??= stream?.codec;
      continue;
    }
    const measured = (await probe(audioPath, signal).catch(() => null))?.durationSec ?? 0;
    throwIfCancelled(signal);
    if (measured < 0.1) {
      await rm(audioPath, { force: true });
      continue;
    }
    return {
      audioPath,
      stats: {
        bytes: (await readFile(audioPath)).byteLength,
        codec: "opus",
        origin: src.origin,
        durationSec: measured,
        ...(gainDb > 0 ? { gainDb } : {}),
      },
    };
  }

  const who = src.origin === "video" ? "El audio del video" : "El audio elegido";
  const tail = "; se generó solo el sticker.";
  if (reason === "silent") return { warning: `${who} está en silencio en ese tramo${tail}` };
  if (reason === "undecodable") {
    return { warning: `No se pudo leer ${who.toLowerCase()}${badCodec ? ` (códec ${badCodec})` : ""}${tail}` };
  }
  const end = src.streams.reduce(
    (max, s) => (s.durationSec !== undefined ? Math.max(max, (s.startSec ?? 0) + s.durationSec) : max),
    0,
  );
  const from = secs(src.startSec);
  const to = secs(src.startSec + src.durationSec);
  return {
    warning:
      end > 0 && end <= src.startSec
        ? `El tramo ${from}–${to} no tiene sonido: ${who.toLowerCase()} termina en ${secs(end)}${tail}`
        : `El tramo ${from}–${to} no tiene sonido${tail}`,
  };
}

export const kb = (bytes: number): string => `${(bytes / 1024).toFixed(0)} KB`;
