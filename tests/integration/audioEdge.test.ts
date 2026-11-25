import { rm } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzeAudio } from "../../src/core/audio/encodeAudio.js";
import { convertToSoundSticker } from "../../src/pipeline/convert.js";
import { ffmpegPath, run } from "../../src/utils/ffmpeg.js";
import { makeTempDir } from "../helpers/fixtures.js";

let dir: string;
const files: Record<string, string> = {};
const V = ["-f", "lavfi", "-i", "testsrc2=size=320x240:rate=15:duration=8"];
const enc = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac"];

async function make(name: string, args: string[], shortest = true) {
  files[name] = join(dir, `${name}.mp4`);
  const tail = shortest ? ["-shortest"] : [];
  await run(ffmpegPath(), ["-v", "error", "-y", ...V, ...args, ...enc, ...tail, files[name] as string]);
}

beforeAll(async () => {
  dir = await makeTempDir();
  await Promise.all([
    // audio starts at 3 s
    make("late", [
      "-f",
      "lavfi",
      "-i",
      "sine=f=440:d=8",
      "-filter_complex",
      "[1]adelay=3000|3000[a]",
      "-map",
      "0:v",
      "-map",
      "[a]",
    ]),
    // audio ends at 2 s
    make("short", ["-f", "lavfi", "-i", "sine=f=440:d=2", "-map", "0:v", "-map", "1:a"], false),
    // muted track (screen recordings)
    make("silent", ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo:d=8", "-map", "0:v", "-map", "1:a"]),
    // first track muted, second (default) has the sound
    make("twotracks", [
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=48000:cl=mono:d=8",
      "-f",
      "lavfi",
      "-i",
      "sine=f=660:d=8",
      "-map",
      "0:v",
      "-map",
      "1:a",
      "-map",
      "2:a",
      "-disposition:a:0",
      "0",
      "-disposition:a:1",
      "default",
    ]),
  ]);
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const convert = (name: string, startSec: number, durationSec: number) =>
  convertToSoundSticker({
    input: files[name] as string,
    outDir: dir,
    name: `${name}-${startSec}`,
    startSec,
    durationSec,
  });

describe("robust sound extraction", () => {
  it("late audio: aligned to the segment start (leading silence), normalized", async () => {
    const r = await convert("late", 0, 5);
    expect(r.stats.audio?.durationSec).toBeCloseTo(5, 0);
    expect(r.stats.audio?.gainDb).toBeGreaterThan(0); // sine at -18 dB gets lifted
    const head = await analyzeAudio({ input: r.audioPath as string, startSec: 0, durationSec: 2.8 });
    const body = await analyzeAudio({ input: r.audioPath as string, startSec: 3.2, durationSec: 1.5 });
    expect(head.maxVolumeDb).toBeLessThan(-60);
    expect(body.maxVolumeDb).toBeGreaterThan(-3);
  });

  it("segment after the audio ends: no fake audio, explains where it ends", async () => {
    const r = await convert("short", 4, 4);
    expect(r.audioPath).toBeUndefined();
    expect(r.stats.audio).toBeUndefined();
    expect(r.warnings.join(" ")).toMatch(/termina en 2\.0 s/);
  });

  it("muted track: no audio + clear warning (sticker still produced)", async () => {
    const r = await convert("silent", 0, 3);
    expect(r.audioPath).toBeUndefined();
    expect(r.warnings.join(" ")).toMatch(/en silencio/);
    expect(r.stats.sticker.bytes).toBeGreaterThan(0);
  });

  it("two tracks: picks the one with real sound", async () => {
    const r = await convert("twotracks", 0, 3);
    expect(r.audioPath).toBeDefined();
    const loud = await analyzeAudio({ input: r.audioPath as string, startSec: 0, durationSec: 3 });
    expect(loud.maxVolumeDb).toBeGreaterThan(-3);
  });
});
