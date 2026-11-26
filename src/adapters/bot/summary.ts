import { whatsappIssues } from "../../core/whatsappCompat.js";
import type { ConvertResult } from "../../pipeline/convert.js";
import { formatTime } from "../../utils/time.js";

export type Delivery = "native" | "separate" | "separate-fallback" | "sticker-only";

const DELIVERY: Record<Delivery, string> = {
  native: "con sonido 🔊",
  separate: "sticker + nota de voz",
  "separate-fallback": "sticker + nota de voz (el envío nativo falló)",
  "sticker-only": "solo sticker (sin sonido)",
};

/** Final status text for a finished job. Pure. */
export function formatSummary(result: ConvertResult, delivery: Delivery): string {
  const s = result.stats.sticker;
  const a = result.stats.audio;
  const shape = s.animated ? `${s.fps} fps · ${formatTime(s.durationMs / 1000)}` : "estático";
  const sound = a ? ` · 🔊 ${formatTime(a.durationSec)}${a.gainDb ? ` (+${a.gainDb} dB)` : ""}` : "";
  const lines = [
    `✔ Listo · ${DELIVERY[delivery]}`,
    `${(s.bytes / 1024).toFixed(0)} KB · ${shape} · calidad ${s.quality}${sound}`,
    ...result.warnings.map((w) => `⚠️ ${w}`),
    ...whatsappIssues({
      animated: s.animated,
      animationSec: s.animated ? s.durationMs / 1000 : 0,
      audioSec: a ? a.durationSec : null,
      bytes: s.bytes,
    }).map((w) => `⚠️ ${w}`),
  ];
  return lines.join("\n");
}
