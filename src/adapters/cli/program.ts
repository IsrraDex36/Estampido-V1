import { mkdir, readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { Command, InvalidArgumentError } from "commander";
import { STICKER_LIMITS } from "../../config/limits.js";
import { UserInputError } from "../../core/errors.js";
import { type ConvertOptions, type ConvertResult, convertToSoundSticker } from "../../pipeline/convert.js";
import { checkDeps } from "../../utils/deps.js";
import { formatReport } from "./format.js";

const seconds =
  (label: string, { min = 0, max = Number.POSITIVE_INFINITY, exclusiveMin = false } = {}) =>
  (value: string): number => {
    const n = Number(value);
    const low = exclusiveMin ? n <= min : n < min;
    if (!Number.isFinite(n) || low || n > max) {
      throw new InvalidArgumentError(
        `${label} debe ser un número ${exclusiveMin ? ">" : "≥"} ${min}${Number.isFinite(max) ? ` y ≤ ${max}` : ""}.`,
      );
    }
    return n;
  };

/** Safe base name derived from the input file (no path chars). */
export const outputName = (input: string): string =>
  basename(input, extname(input))
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 80) || "sticker";

export interface CliDeps {
  convert?: (o: ConvertOptions) => Promise<ConvertResult>;
  log?: (s: string) => void;
  error?: (s: string) => void;
}

export function buildProgram(version: string, deps: CliDeps = {}): Command {
  const convert = deps.convert ?? convertToSoundSticker;
  const log = deps.log ?? console.log;
  const error = deps.error ?? console.error;

  const program = new Command()
    .name("sva")
    .description("Video, GIF o imagen → sticker WebP para WhatsApp + pista de audio (sound sticker)")
    .version(version)
    .exitOverride()
    .configureOutput({
      writeOut: (s) => log(s.trimEnd()),
      writeErr: (s) => error(s.trimEnd()),
    });

  program
    .command("convert")
    .description(
      "Convierte un video/GIF en sticker animado (≤ 500 KB) o una imagen en sticker estático (≤ 100 KB), + audio (.ogg Opus)",
    )
    .argument("<archivo>", "video, GIF, WebP animado o imagen (png/jpg/webp)")
    .option("-s, --start <seg>", "inicio del segmento (videos/GIF)", seconds("--start"), 0)
    .option(
      "-d, --duration <seg>",
      `duración: clip de video o sonido de GIF (máx. ${STICKER_LIMITS.maxDurationSec}); sonido de imagen (máx. ${STICKER_LIMITS.maxImageAudioSec}). Por defecto ${STICKER_LIMITS.defaultDurationSec}, o lo que dure el audio en imágenes`,
      seconds("--duration", {
        min: 0,
        max: Math.max(STICKER_LIMITS.maxDurationSec, STICKER_LIMITS.maxImageAudioSec),
        exclusiveMin: true,
      }),
    )
    .option("--crop", "recortar al centro en vez de padding transparente")
    .option("-a, --audio <archivo>", "sonido de otro archivo (audio o video); necesario para imágenes y GIF")
    .option("--audio-start <seg>", "inicio dentro del archivo de --audio", seconds("--audio-start"), 0)
    .option("--no-audio", "solo sticker, sin audio")
    .option("-o, --out <dir>", "carpeta de salida", ".")
    .option("-n, --name <nombre>", "nombre base de los archivos (por defecto, el del video)")
    .option("--pack <nombre>", "nombre del pack (metadatos de WhatsApp)")
    .option("--author <nombre>", "autor del pack (metadatos de WhatsApp)")
    .option("--emoji <lista>", "hasta 3 emojis separados por coma, p. ej. 😂,🔊")
    .option("--no-metadata", "no incrustar metadatos de pack/autor")
    .option(
      "--max-kb <kb>",
      `EXPERIMENTAL: tope de tamaño del sticker en KB (por defecto 500/100; máx. ${STICKER_LIMITS.experimentalMaxBytes / 1024})`,
      seconds("--max-kb", { min: 1, max: STICKER_LIMITS.experimentalMaxBytes / 1024 }),
    )
    .option("--json", "imprimir el resultado como JSON")
    .action(async (video: string, o) => {
      const outDir = resolve(o.out);
      await mkdir(outDir, { recursive: true });
      const audio: ConvertOptions["audio"] =
        o.audio === false
          ? "none"
          : typeof o.audio === "string"
            ? { file: resolve(o.audio), startSec: o.audioStart }
            : "source";
      const result = await convert({
        input: resolve(video),
        outDir,
        name: o.name ? outputName(o.name) : outputName(video),
        startSec: o.start,
        durationSec: o.duration,
        fit: o.crop ? "crop" : "pad",
        audio,
        maxBytes: o.maxKb ? Math.round(o.maxKb * 1024) : undefined,
        metadata:
          o.metadata === false
            ? false
            : {
                packName: o.pack,
                publisher: o.author,
                emojis: typeof o.emoji === "string" ? o.emoji.split(",") : undefined,
              },
      });
      log(o.json ? JSON.stringify(result, null, 2) : formatReport(result));
    });

  program
    .command("doctor")
    .description("Verifica ffmpeg/ffprobe y los encoders libwebp_anim + libopus")
    .action(async () => {
      const checks = await checkDeps();
      for (const c of checks) log(`${c.ok ? "✔" : "✘"} ${c.name}: ${c.detail}`);
      if (checks.some((c) => !c.ok)) throw new UserInputError("Faltan dependencias. Usa `brew install ffmpeg-full`.");
    });

  return program;
}

export async function readVersion(): Promise<string> {
  // Same relative depth from src/adapters/cli and dist/adapters/cli.
  const pkg = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8"));
  return String(pkg.version);
}
