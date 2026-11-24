import { UserInputError } from "../core/errors.js";
import { classifyMedia } from "../core/probe/probe.js";
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
  const source = await probeUserFile(opts.input, "el archivo");
  if (!source.hasVideo) throw new UserInputError("El archivo no es un video, GIF ni imagen.");
  const kind = classifyMedia(source);
  return kind === "image" ? convertImage(opts, source) : convertAnimated(opts, source, kind);
}
