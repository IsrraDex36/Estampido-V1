import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { encodeAudio } from "../core/audio/encodeAudio.js";
import { UserInputError } from "../core/errors.js";
import { buildStickerExif, resolveMetadata, type StickerMetadata } from "../core/metadata/stickerExif.js";
import { type MediaInfo, probe } from "../core/probe/probe.js";
import { embedExif, exifOverhead } from "../core/webp/chunks.js";
import { inspectWebp, type WebpInfo } from "../core/webp/inspect.js";
import type { ConvertOptions, ConvertResult, ReplacementAudio } from "./types.js";

/** ffprobe a user-supplied file; unreadable input is the user's problem, not ours. */
export async function probeUserFile(path: string, what: string): Promise<MediaInfo> {
  try {
    return await probe(path);
  } catch {
    throw new UserInputError(`No se pudo leer ${what}. ¿Es un archivo válido?`);
  }
}

/** Validate a replacement sound before any costly encode. Returns its probe. */
export async function validateReplacement(audio: ReplacementAudio): Promise<MediaInfo> {
  const info = await probeUserFile(audio.file, "el audio");
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

/** Encode a sound segment to `<name>.ogg` and return its stats. */
export async function encodeTrack(
  outDir: string,
  name: string,
  input: string,
  startSec: number,
  durationSec: number,
  origin: "video" | "file",
): Promise<{ audioPath: string; stats: NonNullable<ConvertResult["stats"]["audio"]> }> {
  const audioPath = join(outDir, `${name}.ogg`);
  await encodeAudio({ input, output: audioPath, startSec, durationSec });
  return {
    audioPath,
    stats: { bytes: (await readFile(audioPath)).byteLength, codec: "opus", origin, durationSec },
  };
}

export const kb = (bytes: number): string => `${(bytes / 1024).toFixed(0)} KB`;
