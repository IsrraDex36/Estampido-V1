import { join } from "node:path";
import { DEFAULT_FIT, STICKER_LIMITS } from "../config/limits.js";
import { fitToSize } from "../core/optimize/fitToSize.js";
import type { MediaInfo } from "../core/probe/probe.js";
import { encodeVideo } from "../core/video/encodeVideo.js";
import { resolveSegment } from "../core/video/segment.js";
import { totalDurationMs } from "../core/webp/inspect.js";
import {
  assertMaxDuration,
  availableAfter,
  encodeTrack,
  finalizeWebp,
  kb,
  prepareMetadata,
  validateReplacement,
} from "./shared.js";
import type { ConvertOptions, ConvertResult } from "./types.js";

/**
 * Video or animated source (GIF / animated WebP) → animated WebP ≤ 500 KB
 * + optional Opus track.
 * - video: sound = same segment of the video, or a replacement file.
 * - animated: no own sound; with a file, the sound may be longer than the
 *   animation (the sticker loops), up to `durationSec` (default 5 s).
 */
export async function convertAnimated(
  opts: ConvertOptions,
  source: MediaInfo,
  kind: "video" | "animated",
): Promise<ConvertResult> {
  const t0 = performance.now();
  const warnings: string[] = [];
  const name = opts.name ?? "sticker";
  const maxBytes = opts.maxBytes ?? STICKER_LIMITS.maxAnimatedBytes;
  assertMaxDuration(opts.durationSec, STICKER_LIMITS.maxDurationSec, "El sticker animado");

  const audioMode = opts.audio ?? "source";
  const replacement = typeof audioMode === "object" ? await validateReplacement(audioMode) : null;
  const { metadata, exif, overhead } = prepareMetadata(opts.metadata);

  const segment = resolveSegment(source.durationSec, opts.startSec, opts.durationSec);
  if (kind === "video" && opts.durationSec !== undefined && segment.durationSec < opts.durationSec) {
    warnings.push(`Duración recortada a ${segment.durationSec.toFixed(2)} s (fin del video).`);
  }

  // Never upsample: duplicated frames get merged by libwebp_anim into uneven
  // frame durations (e.g. 10 fps GIF at 15 fps → 67/133 ms).
  const maxFps = source.fps > 0 ? Math.max(1, Math.floor(source.fps)) : Number.POSITIVE_INFINITY;

  const webpPath = join(opts.outDir, `${name}.webp`);
  const fitted = await fitToSize(
    (a) =>
      encodeVideo({
        input: opts.input,
        output: webpPath,
        ...segment,
        fit: opts.fit ?? DEFAULT_FIT,
        quality: a.quality,
        fps: Math.min(a.fps, maxFps),
        seek: kind === "animated" ? "output" : "input",
      }),
    webpPath,
    maxBytes - overhead,
  );
  if (!fitted.withinLimit) {
    warnings.push(
      `El sticker pesa ${kb(fitted.bytes + overhead)} y supera ${kb(maxBytes)} incluso a calidad mínima. Prueba un clip más corto.`,
    );
  }
  const { bytes, info } = await finalizeWebp(webpPath, exif);

  let audioPath: string | undefined;
  let audioStats: ConvertResult["stats"]["audio"];
  if (replacement && typeof audioMode === "object") {
    const start = audioMode.startSec ?? 0;
    // Animated sources loop, so their sound isn't bound to the animation length.
    const loops = kind === "animated" || opts.loops === true;
    const wanted = loops ? (opts.durationSec ?? STICKER_LIMITS.defaultDurationSec) : segment.durationSec;
    const duration = Math.min(wanted, availableAfter(replacement, start));
    ({ audioPath, stats: audioStats } = await encodeTrack(opts.outDir, name, audioMode.file, start, duration, "file"));
  } else if (audioMode === "source" && source.hasAudio) {
    ({ audioPath, stats: audioStats } = await encodeTrack(
      opts.outDir,
      name,
      opts.input,
      segment.startSec,
      segment.durationSec,
      "video",
    ));
  } else if (audioMode === "source") {
    warnings.push(
      kind === "animated"
        ? "Los GIF y WebP animados no tienen sonido; agrega un audio propio para un sticker con sonido."
        : "El video no tiene pista de audio; se generó solo el sticker.",
    );
  }

  return {
    kind,
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
        animated: true,
        bytes: bytes.length,
        withinLimit: bytes.length <= maxBytes,
        maxBytes,
        quality: fitted.quality,
        fps: Math.min(fitted.fps, maxFps),
        frames: info.frames.length,
        durationMs: totalDurationMs(info),
        attempts: fitted.attempts,
        metadata,
      },
      audio: audioStats,
      elapsedMs: Math.round(performance.now() - t0),
    },
  };
}
