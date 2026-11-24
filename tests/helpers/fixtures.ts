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
  if (audio)
    args.push("-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`);
  args.push("-c:v", "libx264", "-pix_fmt", "yuv420p");
  if (audio) args.push("-c:a", "aac", "-shortest");
  args.push(out);
  await run(ffmpegPath(), args);
  return out;
}
