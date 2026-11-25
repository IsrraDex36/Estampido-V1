import { join } from "node:path";
import { DEFAULT_FIT, STICKER_LIMITS } from "../config/limits.js";
import { UserInputError } from "../core/errors.js";
import { encodeImage, STATIC_LADDER } from "../core/image/encodeImage.js";
import { fitToSize } from "../core/optimize/fitToSize.js";
import type { MediaInfo } from "../core/probe/probe.js";
import {
  assertMaxDuration,
  availableAfter,
  extractSound,
  finalizeWebp,
  kb,
  prepareMetadata,
  validateReplacement,
} from "./shared.js";
import type { ConvertOptions, ConvertResult } from "./types.js";

/**
 * Still image → static WebP ≤ 100 KB + optional sound from a file
 * (≤ 10 s, WhatsApp's limit for image sound stickers).
 */
export async function convertImage(opts: ConvertOptions, source: MediaInfo): Promise<ConvertResult> {
  const t0 = performance.now();
  const warnings: string[] = [];
  const name = opts.name ?? "sticker";
  const maxBytes = opts.maxBytes ?? STICKER_LIMITS.maxStaticBytes;
  assertMaxDuration(opts.durationSec, STICKER_LIMITS.maxImageAudioSec, "El sonido de un sticker de imagen");
  if (opts.durationSec !== undefined && opts.durationSec <= 0) {
    throw new UserInputError(`La duración debe ser > 0 (recibido ${opts.durationSec}).`);
  }
  if (opts.startSec) warnings.push("El inicio no aplica a imágenes; se ignoró.");

  const audioMode = opts.audio ?? "source";
  const replacement = typeof audioMode === "object" ? await validateReplacement(audioMode, opts.signal) : null;
  const { metadata, exif, overhead } = prepareMetadata(opts.metadata);

  const webpPath = join(opts.outDir, `${name}.webp`);
  const fitted = await fitToSize(
    (a) =>
      encodeImage({
        input: opts.input,
        output: webpPath,
        fit: opts.fit ?? DEFAULT_FIT,
        quality: a.quality,
        signal: opts.signal,
      }),
    webpPath,
    maxBytes - overhead,
    STATIC_LADDER,
  );
  if (!fitted.withinLimit) {
    warnings.push(`El sticker pesa ${kb(fitted.bytes + overhead)} y supera ${kb(maxBytes)} incluso a calidad mínima.`);
  }
  const { bytes, info } = await finalizeWebp(webpPath, exif);

  let audioPath: string | undefined;
  let audioStats: ConvertResult["stats"]["audio"];
  let segment = { startSec: 0, durationSec: 0 };
  if (replacement && typeof audioMode === "object") {
    const start = audioMode.startSec ?? 0;
    const available = availableAfter(replacement, start);
    const duration = Math.min(opts.durationSec ?? STICKER_LIMITS.maxImageAudioSec, available);
    if (opts.durationSec === undefined && available > STICKER_LIMITS.maxImageAudioSec) {
      warnings.push(`El audio se recortó a ${STICKER_LIMITS.maxImageAudioSec} s (máximo para imágenes).`);
    }
    segment = { startSec: start, durationSec: duration };
    const sound = await extractSound(
      opts.outDir,
      name,
      {
        input: audioMode.file,
        startSec: start,
        durationSec: duration,
        origin: "file",
        streams: replacement.audioStreams,
      },
      opts.signal,
    );
    if ("warning" in sound) warnings.push(sound.warning);
    else ({ audioPath, stats: audioStats } = sound);
  } else if (audioMode === "source") {
    warnings.push("Las imágenes no tienen sonido; agrega un audio propio para un sticker con sonido.");
  }

  return {
    kind: "image",
    webpPath,
    audioPath,
    warnings,
    stats: {
      source: { durationSec: 0, width: source.width, height: source.height, fps: 0, hasAudio: false },
      segment,
      sticker: {
        animated: info.animated,
        bytes: bytes.length,
        withinLimit: bytes.length <= maxBytes,
        maxBytes,
        quality: fitted.quality,
        fps: 0,
        frames: 1,
        durationMs: 0,
        attempts: fitted.attempts,
        metadata,
      },
      audio: audioStats,
      elapsedMs: Math.round(performance.now() - t0),
    },
  };
}
