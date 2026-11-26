import { readFile } from "node:fs/promises";
import { UserInputError } from "../core/errors.js";
import { classifyMedia } from "../core/probe/probe.js";
import { inspectWebp, totalDurationMs } from "../core/webp/inspect.js";
import { convertImage } from "./convertImage.js";
import { convertAnimated } from "./convertVideo.js";
import { probeUserFile } from "./shared.js";
import type { ConvertOptions, ConvertResult } from "./types.js";

export type { ConvertOptions, ConvertResult, ReplacementAudio } from "./types.js";

/**
 * Any supported input → WhatsApp sticker + optional sound track.
 * Detects the kind (video / GIF-animated WebP / still image) and dispatches.
 */
export async function convertToSoundSticker(opts: ConvertOptions): Promise<ConvertResult> {
  const source = await probeUserFile(opts.input, "el archivo", opts.signal);
  if (!source.hasVideo) throw new UserInputError("El archivo no es un video, GIF ni imagen.");
  const kind = classifyMedia(source);
  if (kind === "animated" && !(source.durationSec > 0)) {
    // ffprobe reports 0 s for animated WebP: measure the frames ourselves, so a
    // short animation can be stretched to its sound (and segments make sense).
    const ms = await readFile(opts.input)
      .then((buf) => totalDurationMs(inspectWebp(buf)))
      .catch(() => 0);
    if (ms > 0) return convertAnimated(opts, { ...source, durationSec: ms / 1000 }, kind);
  }
  return kind === "image" ? convertImage(opts, source) : convertAnimated(opts, source, kind);
}
