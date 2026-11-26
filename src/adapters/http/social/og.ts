import { createHash } from "node:crypto";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { ffmpegPath, run } from "../../../utils/ffmpeg.js";

/**
 * Link-preview images (1200×630 PNG) for shared packs and creator pages: the
 * stickers themselves in a tidy row on the brand's dark background, so a
 * link pasted in WhatsApp shows what's inside. Built once per set of
 * stickers (the file name is a hash of them) and kept on disk.
 */
export const OG_W = 1200;
export const OG_H = 630;
const BG = "0x0e0e13";
const TILE = "0x1b1b24";

/** Tile size and positions for 1–4 stickers, centered. Pure (tested). */
export function ogLayout(n: number): { size: number; xs: number[]; y: number } {
  const count = Math.max(1, Math.min(4, n));
  const size = count === 1 ? 440 : count === 2 ? 400 : 250;
  const gap = count <= 2 ? 48 : 32;
  const total = count * size + (count - 1) * gap;
  const x0 = Math.round((OG_W - total) / 2);
  return { size, xs: Array.from({ length: count }, (_, i) => x0 + i * (size + gap)), y: Math.round((OG_H - size) / 2) };
}

/** ffmpeg args drawing the card from sticker files (first frame of each). Pure (tested). */
export function ogArgs(files: string[], out: string): string[] {
  const { size, xs, y } = ogLayout(files.length);
  const pad = Math.round(size * 0.06);
  const inner = size - pad * 2;
  const used = files.slice(0, xs.length);
  const tiles = xs.map((x) => `drawbox=x=${x}:y=${y}:w=${size}:h=${size}:color=${TILE}:t=fill`).join(",");
  const graph = [
    `[0:v]${tiles}[bg0]`,
    ...used.map(
      (_, i) =>
        `[${i + 1}:v]scale=${inner}:${inner}:force_original_aspect_ratio=decrease,format=rgba,pad=${inner}:${inner}:(ow-iw)/2:(oh-ih)/2:color=black@0[s${i}]`,
    ),
    ...used.map((_, i) => `[bg${i}][s${i}]overlay=${(xs[i] ?? 0) + pad}:${y + pad}[bg${i + 1}]`),
  ].join(";");
  return [
    "-hide_banner",
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${BG}:s=${OG_W}x${OG_H}:d=1`,
    ...used.flatMap((f) => ["-i", f]),
    "-filter_complex",
    graph,
    "-map",
    `[bg${used.length}]`,
    "-frames:v",
    "1",
    out,
  ];
}

export class OgImages {
  private readonly building = new Map<string, Promise<string>>();

  constructor(private readonly dir: string) {}

  /**
   * Path of the card for these sticker files (built if needed). `key` names
   * the subject (e.g. "pack-<id>"): older cards of the same subject are removed.
   */
  async card(key: string, files: string[]): Promise<string> {
    const hash = createHash("sha256").update(files.join("\n")).digest("hex").slice(0, 16);
    const name = `${key}-${hash}.png`;
    const path = join(this.dir, name);
    if (await stat(path).catch(() => null)) return path;
    let p = this.building.get(name);
    if (!p) {
      p = this.build(key, name, files).finally(() => this.building.delete(name));
      this.building.set(name, p);
    }
    return p;
  }

  private async build(key: string, name: string, files: string[]): Promise<string> {
    await mkdir(this.dir, { recursive: true });
    const path = join(this.dir, name);
    const tmp = `${path}.${process.pid}.tmp.png`;
    await run(ffmpegPath(), ogArgs(files, tmp), { timeoutMs: 20_000 });
    await rename(tmp, path);
    // Drop previous cards of this subject (its stickers changed).
    for (const old of await readdir(this.dir).catch(() => [] as string[])) {
      if (old.startsWith(`${key}-`) && old !== name) await rm(join(this.dir, old), { force: true });
    }
    return path;
  }
}
