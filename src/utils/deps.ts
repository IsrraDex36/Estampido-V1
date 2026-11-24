import { ffmpegPath, ffprobePath, run } from "./ffmpeg.js";

export const REQUIRED_ENCODERS = ["libwebp_anim", "libopus"] as const;

export interface DepCheck {
  name: string;
  ok: boolean;
  detail: string;
}

/** Verify ffmpeg/ffprobe exist and ffmpeg has the encoders we need. */
export async function checkDeps(): Promise<DepCheck[]> {
  const checks: DepCheck[] = [];
  let ffmpegOk = false;
  for (const [name, bin] of [
    ["ffmpeg", ffmpegPath()],
    ["ffprobe", ffprobePath()],
  ] as const) {
    try {
      const { stdout } = await run(bin, ["-version"]);
      checks.push({
        name,
        ok: true,
        detail: `${stdout.split("\n")[0]} (${bin})`,
      });
      if (name === "ffmpeg") ffmpegOk = true;
    } catch {
      checks.push({
        name,
        ok: false,
        detail: `no encontrado (${bin}). Instala: brew install ffmpeg-full`,
      });
    }
  }
  if (ffmpegOk) {
    const { stdout } = await run(ffmpegPath(), ["-hide_banner", "-encoders"]);
    for (const enc of REQUIRED_ENCODERS) {
      const ok = new RegExp(`\\s${enc}\\s`).test(stdout);
      checks.push({
        name: `encoder ${enc}`,
        ok,
        detail: ok ? "disponible" : "falta (usa ffmpeg-full)",
      });
    }
  }
  return checks;
}
