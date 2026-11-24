import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_FIT, type FitMode, STICKER_LIMITS } from "../config/limits.js";
import { encodeAudio } from "../core/audio/encodeAudio.js";
import { fitToSize } from "../core/optimize/fitToSize.js";
import { probe } from "../core/probe/probe.js";
import { encodeVideo } from "../core/video/encodeVideo.js";
import { resolveSegment } from "../core/video/segment.js";
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
  /** "source" = video's own audio, "none" = silent, or path to replacement audio. */
  audio?: "source" | "none" | { file: string };
  maxBytes?: number;
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
    };
    audio?: { bytes: number; codec: "opus" };
    elapsedMs: number;
  };
}

/** Video → animated WebP (≤ size limit) + optional Opus audio track. */
export async function convertVideoToSoundSticker(
  opts: ConvertOptions,
): Promise<ConvertResult> {
  const t0 = performance.now();
  const warnings: string[] = [];
  const name = opts.name ?? "sticker";
  const maxBytes = opts.maxBytes ?? STICKER_LIMITS.maxAnimatedBytes;
  const fit = opts.fit ?? DEFAULT_FIT;

  const source = await probe(opts.input);
  if (!source.hasVideo) throw new Error("Input has no video stream");
  const segment = resolveSegment(
    source.durationSec,
    opts.startSec,
    opts.durationSec,
  );
  if (
    opts.durationSec !== undefined &&
    segment.durationSec < opts.durationSec
  ) {
    warnings.push(
      `Duración recortada a ${segment.durationSec.toFixed(2)} s (fin del video).`,
    );
  }

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
    maxBytes,
  );
  if (!fitted.withinLimit) {
    warnings.push(
      `El sticker pesa ${(fitted.bytes / 1024).toFixed(0)} KB y supera ${(maxBytes / 1024).toFixed(0)} KB incluso a calidad mínima. Prueba un clip más corto.`,
    );
  }
  const webp = inspectWebp(await readFile(webpPath));

  let audioPath: string | undefined;
  let audioStats: ConvertResult["stats"]["audio"];
  const audioMode = opts.audio ?? "source";
  if (audioMode !== "none") {
    const audioInput =
      typeof audioMode === "object" ? audioMode.file : opts.input;
    const hasAudio =
      typeof audioMode === "object"
        ? (await probe(audioMode.file)).hasAudio
        : source.hasAudio;
    if (!hasAudio) {
      warnings.push(
        "La fuente no tiene pista de audio; se generó solo el sticker.",
      );
    } else {
      audioPath = join(opts.outDir, `${name}.ogg`);
      const audioStart = typeof audioMode === "object" ? 0 : segment.startSec;
      await encodeAudio({
        input: audioInput,
        output: audioPath,
        startSec: audioStart,
        durationSec: segment.durationSec,
      });
      audioStats = {
        bytes: (await readFile(audioPath)).byteLength,
        codec: "opus",
      };
    }
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
        bytes: fitted.bytes,
        withinLimit: fitted.withinLimit,
        maxBytes,
        quality: fitted.quality,
        fps: fitted.fps,
        frames: webp.frames.length,
        durationMs: totalDurationMs(webp),
        attempts: fitted.attempts,
      },
      audio: audioStats,
      elapsedMs: Math.round(performance.now() - t0),
    },
  };
}
