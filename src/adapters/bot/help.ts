import { INPUT_LIMITS, STICKER_LIMITS } from "../../config/limits.js";
import { formatTime } from "../../utils/time.js";

/** /ayuda body (everything after the intro line). */
const HELP_BODY = [
  "Envía un video, GIF, imagen o sticker con */saudio* en el texto, o responde a uno con */saudio*.",
  "",
  "*Ejemplos*",
  `• /saudio → los primeros ${STICKER_LIMITS.whatsappMaxAnimationSec} s (lo que WhatsApp anima)`,
  `• /saudio 0:12 → ${STICKER_LIMITS.whatsappMaxAnimationSec} s desde 0:12`,
  "• /saudio 1:20 0:05 → 5 s desde 1:20",
  "• /saudio voz → usa tu próxima nota de voz como sonido",
  "• /saudio pad → sin recortar (bordes transparentes)",
  `• /saudio hq → más calidad, hasta ${STICKER_LIMITS.experimentalMaxBytes / 1024 / 1024} MB (experimental)`,
  `Puedes pedir hasta ${formatTime(STICKER_LIMITS.maxDurationSec)}, pero WhatsApp solo anima ${STICKER_LIMITS.whatsappMaxAnimationSec} s: más largo se queda quieto mientras suena.`,
  "",
  `Imágenes, GIF y stickers no traen sonido: te pediré una nota de voz (imágenes: máx. ${STICKER_LIMITS.maxImageAudioSec} s).`,
  `*/cancelar* detiene lo que esté en curso. Archivos de hasta ${INPUT_LIMITS.maxVideoBytes / 1024 / 1024} MB.`,
].join("\n");

/** /ayuda with an intro line (varies, see phrases.ts helpIntro). */
export const helpText = (intro = "🔊 *Estampido* · haz ruido en el chat"): string => `${intro}\n\n${HELP_BODY}`;

/** Canonical /ayuda text. */
export const HELP_TEXT = helpText();

export const isHelp = (text: string | null | undefined): boolean => /^[/!.](ayuda|help)$/i.test((text ?? "").trim());
