/**
 * What the bot says, each with naturally written variants (same meaning,
 * different wording). The first variant is the canonical one (used when
 * humanizing is off, e.g. tests). Keep facts identical across variants.
 */
export const PHRASES = {
  linkOk: [
    "✅ ¡Listo! Este chat quedó vinculado a Estampido: ya puedes enviarte stickers con sonido desde la web. Para desvincular, hazlo desde la web.",
    "✅ ¡Hecho! Ya vinculamos este chat. Desde la web puedes mandarte stickers con sonido cuando quieras; si quieres desvincularlo, se hace desde la web.",
    "🎉 ¡Vinculado! A partir de ahora los stickers con sonido que envíes desde la web llegan aquí. Puedes desvincularlo desde la web.",
    "✅ ¡Todo listo! Tu WhatsApp quedó conectado con Estampido. Vuelve a la web y envíate tus stickers con sonido (desde ahí también puedes desvincularlo).",
  ],
  linkExpired: [
    "⌛ Ese código caducó. Genera uno nuevo en la web y vuelve a enviarlo.",
    "⌛ Ese código ya venció. Pide uno nuevo en la web y mándalo otra vez.",
    "⌛ Se acabó el tiempo de ese código. En la web puedes generar otro y enviarlo de nuevo.",
  ],
  linkUnknown: [
    "🤔 No reconozco ese código. Genera uno nuevo en la web.",
    "🤔 Mmm, ese código no me suena. Crea uno nuevo en la web y envíamelo.",
    "🤔 No encontré ese código. Genera otro en la web e inténtalo de nuevo.",
  ],
  linkRateLimited: [
    "⏳ Demasiados intentos. Espera unos minutos y genera un código nuevo.",
    "⏳ Fueron muchos intentos seguidos. Dame unos minutos y luego genera un código nuevo.",
    "⏳ Vamos más despacio 🙂 Espera unos minutos y vuelve a generar un código.",
  ],
  helpIntro: [
    "🔊 *Estampido* · haz ruido en el chat",
    "🔊 *Estampido* · stickers que suenan",
    "🔊 *Estampido* · tus stickers, con sonido",
  ],
  downloading: ["⏳ Descargando {what}…", "⏳ Recibiendo {what}…", "⏳ Bajando {what}…"],
  creating: ["⚙️ Creando tu sticker…", "⚙️ Preparando tu sticker…", "⚙️ Armando tu sticker…"],
  receivingAudio: ["⏳ Recibiendo tu audio…", "⏳ Descargando tu audio…", "⏳ Bajando tu audio…"],
  tooFast: [
    "Vas muy rápido 🙂 Espera {s} s y vuelve a intentarlo.",
    "Vas muy rápido 🙂 Dame {s} s y lo intentamos otra vez.",
    "Vas muy rápido 🙂 En {s} s puedes volver a intentarlo.",
  ],
} as const;

export type PhraseKind = keyof typeof PHRASES;

/** Fill «{name}» placeholders. */
export const fill = (text: string, values: Record<string, string | number>): string =>
  text.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
