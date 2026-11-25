import type { ConvertResult } from "../../pipeline/convert.js";

const kb = (b: number) => `${(b / 1024).toFixed(1)} KB`;

/** Human-readable conversion report. Pure → unit-testable. */
export function formatReport(r: ConvertResult): string {
  const { sticker: s, source, segment, audio } = r.stats;
  const kindLabel = { video: "video", animated: "GIF/animado", image: "imagen" }[r.kind];
  const shape = s.animated
    ? `animado · ${s.frames} frames · ${s.fps} fps · ${(s.durationMs / 1000).toFixed(2)} s`
    : "estático";
  const lines = [
    `✔ Sticker (${kindLabel}): ${r.webpPath}`,
    `  ${kb(s.bytes)} / ${kb(s.maxBytes)} ${s.withinLimit ? "✔" : "✘ supera el límite"} · ${shape} · calidad ${s.quality} · ${s.attempts} intento(s)`,
    s.metadata
      ? `  Pack: "${s.metadata.packName}" · autor: "${s.metadata.publisher}"${s.metadata.emojis.length ? ` · ${s.metadata.emojis.join(" ")}` : ""}`
      : "  Sin metadatos de pack",
    r.audioPath && audio
      ? `✔ Audio:   ${r.audioPath}\n  ${kb(audio.bytes)} · opus · ${audio.durationSec.toFixed(2)} s · origen: ${audio.origin === "file" ? "archivo" : "video"}${audio.gainDb ? ` · volumen +${audio.gainDb} dB` : ""}`
      : "· Sin audio",
    r.kind === "image"
      ? `  Fuente: ${source.width}×${source.height}`
      : `  Fuente: ${source.width}×${source.height} · ${source.fps.toFixed(0)} fps · ${source.durationSec.toFixed(2)} s · segmento ${segment.startSec}→${(segment.startSec + segment.durationSec).toFixed(2)} s`,
    `  Tiempo: ${(r.stats.elapsedMs / 1000).toFixed(2)} s`,
    ...r.warnings.map((w) => `⚠ ${w}`),
  ];
  return lines.join("\n");
}
