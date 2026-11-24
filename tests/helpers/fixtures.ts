import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegPath, run } from "../../src/utils/ffmpeg.js";

export async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "sva-test-"));
}

/** Synthetic video (testsrc2) with optional sine audio. */
export async function makeVideo(
  dir: string,
  name: string,
  { width = 640, height = 360, seconds = 8, fps = 30, audio = true } = {},
): Promise<string> {
  const out = join(dir, name);
  const args = [
    "-hide_banner",
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `testsrc2=size=${width}x${height}:rate=${fps}:duration=${seconds}`,
  ];
  if (audio) args.push("-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`);
  args.push("-c:v", "libx264", "-pix_fmt", "yuv420p");
  if (audio) args.push("-c:a", "aac", "-shortest");
  args.push(out);
  await run(ffmpegPath(), args);
  return out;
}

/** Generic lavfi → file helper. */
async function lavfi(out: string, filter: string, extra: string[] = []): Promise<string> {
  await run(ffmpegPath(), ["-hide_banner", "-v", "error", "-y", "-f", "lavfi", "-i", filter, ...extra, out]);
  return out;
}

/** Transparent 200×120 canvas with an opaque red square in the middle. */
const ALPHA_SCENE =
  "color=c=black@0:s=200x120:r=10:d=2,format=rgba,drawbox=x=70:y=30:w=60:h=60:color=red@1:t=fill:replace=1";

export const makePng = (dir: string, name = "img.png") =>
  lavfi(join(dir, name), ALPHA_SCENE, ["-frames:v", "1", "-update", "1"]);

export const makeJpeg = (dir: string, name = "photo.jpg") =>
  lavfi(join(dir, name), "testsrc2=size=1600x900:duration=1", ["-frames:v", "1", "-update", "1", "-q:v", "2"]);

/** GIF with real 1-bit transparency (palettegen reserves a transparent index). */
export async function makeGif(dir: string, name = "anim.gif"): Promise<string> {
  const out = join(dir, name);
  const graph = `${ALPHA_SCENE},split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse=alpha_threshold=128`;
  await run(ffmpegPath(), ["-hide_banner", "-v", "error", "-y", "-filter_complex", graph, "-f", "gif", out]);
  return out;
}

export const makeAnimatedWebp = (dir: string, name = "anim.webp") =>
  lavfi(join(dir, name), "testsrc2=size=320x240:rate=10:duration=2", ["-c:v", "libwebp_anim", "-loop", "0"]);

export const makeTone = (dir: string, seconds: number, name = `tone${seconds}.m4a`) =>
  lavfi(join(dir, name), `sine=frequency=500:duration=${seconds}`, ["-c:a", "aac"]);

/** RGBA pixel of the first frame of any image/WebP (decoded by ffmpeg). */
export async function firstFramePixel(file: string, x: number, y: number, width = 512): Promise<number[]> {
  const { spawn } = await import("node:child_process");
  const raw: Buffer = await new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath(), [
      "-v",
      "error",
      "-i",
      file,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-",
    ]);
    const chunks: Buffer[] = [];
    p.stdout.on("data", (c) => chunks.push(c));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`ffmpeg ${code}`))));
  });
  const i = (y * width + x) * 4;
  return [...raw.subarray(i, i + 4)];
}
