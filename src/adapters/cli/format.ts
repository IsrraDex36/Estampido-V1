import type { ConvertResult } from "../../pipeline/convert.js";

const kb = (b: number) => `${(b / 1024).toFixed(1)} KB`;

/** Human-readable conversion report. Pure → unit-testable. */
export function formatReport(r: ConvertResult): string {
  const { sticker: s, source, segment, audio } = r.stats;
  const lines = [
    `✔ Sticker: ${r.webpPath}`,
    `  ${kb(s.bytes)} / ${kb(s.maxBytes)} ${s.withinLimit ? "✔" : "✘ supera el límite"} · ${s.frames} frames · ${s.fps} fps · calidad ${s.quality} · ${(s.durationMs / 1000).toFixed(2)} s · ${s.attempts} intento(s)`,
    s.metadata
      ? `  Pack: "${s.metadata.packName}" · autor: "${s.metadata.publisher}"${s.metadata.emojis.length ? ` · ${s.metadata.emojis.join(" ")}` : ""}`
      : "  Sin metadatos de pack",
    r.audioPath && audio
      ? `✔ Audio:   ${r.audioPath}\n  ${kb(audio.bytes)} · opus · origen: ${audio.origin === "file" ? "archivo" : "video"}`
      : "· Sin audio",
    `  Fuente: ${source.width}×${source.height} · ${source.fps.toFixed(0)} fps · ${source.durationSec.toFixed(2)} s · segmento ${segment.startSec}→${(segment.startSec + segment.durationSec).toFixed(2)} s`,
    `  Tiempo: ${(r.stats.elapsedMs / 1000).toFixed(2)} s`,
    ...r.warnings.map((w) => `⚠ ${w}`),
  ];
  return lines.join("\n");
}
