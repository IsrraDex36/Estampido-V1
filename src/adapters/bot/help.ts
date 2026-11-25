import { INPUT_LIMITS, STICKER_LIMITS } from "../../config/limits.js";
import { formatTime } from "../../utils/time.js";

/** /ayuda text. */
export const HELP_TEXT = [
  "🔊 *Estampido* · stickers que suenan",
  "",
  "Envía un video, GIF, imagen o sticker con */saudio* en el texto, o responde a uno con */saudio*.",
  "",
  "*Ejemplos*",
  "• /saudio → el video completo (máx. " + formatTime(STICKER_LIMITS.maxDurationSec) + ")",
  "• /saudio 0:12 → desde 0:12 hasta el final",
  "• /saudio 1:20 0:05 → 5 s desde 1:20",
  "• /saudio voz → usa tu próxima nota de voz como sonido",
  "• /saudio pad → sin recortar (bordes transparentes)",
  "• /saudio hq → más calidad, hasta " + STICKER_LIMITS.experimentalMaxBytes / 1024 / 1024 + " MB (experimental)",
  "",
  "Imágenes, GIF y stickers no traen sonido: te pediré una nota de voz (imágenes: máx. " +
    STICKER_LIMITS.maxImageAudioSec +
    " s).",
  "*/cancelar* detiene lo que esté en curso. Archivos de hasta " + INPUT_LIMITS.maxVideoBytes / 1024 / 1024 + " MB.",
].join("\n");

export const isHelp = (text: string | null | undefined): boolean => /^[/!.](ayuda|help)$/i.test((text ?? "").trim());
