import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_FIT, type FitMode, STICKER_LIMITS } from "../config/limits.js";
import { encodeAudio } from "../core/audio/encodeAudio.js";
import { UserInputError } from "../core/errors.js";
import {
  buildStickerExif,
  resolveMetadata,
  type StickerMetadata,
  type StickerMetadataInput,
} from "../core/metadata/stickerExif.js";
import { fitToSize } from "../core/optimize/fitToSize.js";
import { type MediaInfo, probe } from "../core/probe/probe.js";
import { encodeVideo } from "../core/video/encodeVideo.js";
import { resolveSegment } from "../core/video/segment.js";
import { embedExif, exifOverhead } from "../core/webp/chunks.js";
import { inspectWebp, totalDurationMs } from "../core/webp/inspect.js";

export interface ConvertOptions {
  input: string;
  /** Directory for outputs (must exist). */
  outDir: string;
  /** Base name for output files (no extension). */
  name?: string;
  startSec?: number;
  durationSec?: number;
  fit?: FitMode;
  /**
   * "source" = video's own audio, "none" = silent, or a replacement file
   * (audio or video) read from its own `startSec` (default 0).
   */
  audio?: "source" | "none" | ReplacementAudio;
  maxBytes?: number;
  /** WhatsApp pack/author metadata (EXIF). Defaults applied; `false` = none. */
  metadata?: StickerMetadataInput | false;
}

export interface ReplacementAudio {
  file: string;
  startSec?: number;
}

export interface ConvertResult {
  webpPath: string;
  audioPath?: string;
  warnings: string[];
  stats: {
    source: {
      durationSec: number;
      width: number;
      height: number;
      fps: number;
      hasAudio: boolean;
    };
    segment: { startSec: number; durationSec: number };
    sticker: {
      bytes: number;
      withinLimit: boolean;
      maxBytes: number;
      quality: number;
      fps: number;
      frames: number;
      durationMs: number;
      attempts: number;
      metadata: StickerMetadata | null;
    };
    audio?: { bytes: number; codec: "opus"; origin: "video" | "file" };
    elapsedMs: number;
  };
}

/** ffprobe a user-supplied file; unreadable input is the user's problem, not ours. */
async function probeUserFile(path: string, what: string): Promise<MediaInfo> {
  try {
    return await probe(path);
  } catch {
    throw new UserInputError(`No se pudo leer ${what}. ¿Es un archivo válido?`);
  }
}

/** Video → animated WebP (≤ size limit) + optional Opus audio track. */
export async function convertVideoToSoundSticker(opts: ConvertOptions): Promise<ConvertResult> {
  const t0 = performance.now();
  const warnings: string[] = [];
  const name = opts.name ?? "sticker";
  const maxBytes = opts.maxBytes ?? STICKER_LIMITS.maxAnimatedBytes;
  const fit = opts.fit ?? DEFAULT_FIT;

  const source = await probeUserFile(opts.input, "el video");
  if (!source.hasVideo) throw new UserInputError("El archivo no tiene pista de video.");

  // Validate a replacement audio up front: fail fast before the costly encode.
  const audioMode = opts.audio ?? "source";
  if (typeof audioMode === "object") {
    const replacement = await probeUserFile(audioMode.file, "el audio");
    if (!replacement.hasAudio) throw new UserInputError("El archivo de audio elegido no tiene sonido.");
    const start = audioMode.startSec ?? 0;
    if (replacement.durationSec > 0 && start >= replacement.durationSec) {
      throw new UserInputError(
        `El inicio del audio (${start} s) está fuera del archivo (dura ${replacement.durationSec.toFixed(2)} s).`,
      );
    }
  }
  const segment = resolveSegment(source.durationSec, opts.startSec, opts.durationSec);
  if (opts.durationSec !== undefined && segment.durationSec < opts.durationSec) {
    warnings.push(`Duración recortada a ${segment.durationSec.toFixed(2)} s (fin del video).`);
  }

  // Resolve metadata before encoding (invalid input fails fast) and reserve
  // its bytes so the final file, EXIF included, stays within the limit.
  const metadata = opts.metadata === false ? null : resolveMetadata(opts.metadata);
  const exif = metadata ? buildStickerExif(metadata) : null;
  const encodeBudget = maxBytes - (exif ? exifOverhead(exif) : 0);

  const webpPath = join(opts.outDir, `${name}.webp`);
  const fitted = await fitToSize(
    (a) =>
      encodeVideo({
        input: opts.input,
        output: webpPath,
        ...segment,
        fit,
        ...a,
      }),
    webpPath,
    encodeBudget,
  );
  if (!fitted.withinLimit) {
    warnings.push(
      `El sticker pesa ${((fitted.bytes + (exif ? exifOverhead(exif) : 0)) / 1024).toFixed(0)} KB y supera ${(maxBytes / 1024).toFixed(0)} KB incluso a calidad mínima. Prueba un clip más corto.`,
    );
  }
  let webpBytes: Buffer = await readFile(webpPath);
  if (exif) {
    webpBytes = embedExif(webpBytes, exif);
    await writeFile(webpPath, webpBytes);
  }
  const webp = inspectWebp(webpBytes);

  let audioPath: string | undefined;
  let audioStats: ConvertResult["stats"]["audio"];
  if (audioMode === "source" && !source.hasAudio) {
    warnings.push("El video no tiene pista de audio; se generó solo el sticker.");
  } else if (audioMode !== "none") {
    const fromFile = typeof audioMode === "object";
    audioPath = join(opts.outDir, `${name}.ogg`);
    await encodeAudio({
      input: fromFile ? audioMode.file : opts.input,
      output: audioPath,
      startSec: fromFile ? (audioMode.startSec ?? 0) : segment.startSec,
      durationSec: segment.durationSec,
    });
    audioStats = {
      bytes: (await readFile(audioPath)).byteLength,
      codec: "opus",
      origin: fromFile ? "file" : "video",
    };
  }

  return {
    webpPath,
    audioPath,
    warnings,
    stats: {
      source: {
        durationSec: source.durationSec,
        width: source.width,
        height: source.height,
        fps: source.fps,
        hasAudio: source.hasAudio,
      },
      segment,
      sticker: {
        bytes: webpBytes.length,
        withinLimit: webpBytes.length <= maxBytes,
        maxBytes,
        quality: fitted.quality,
        fps: fitted.fps,
        frames: webp.frames.length,
        durationMs: totalDurationMs(webp),
        attempts: fitted.attempts,
        metadata,
      },
      audio: audioStats,
      elapsedMs: Math.round(performance.now() - t0),
    },
  };
}
