import { rm, stat } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { probe } from "../../src/core/probe/probe.js";
import { convertVideoToSoundSticker } from "../../src/pipeline/convert.js";
import { makeTempDir, makeVideo } from "../helpers/fixtures.js";

let dir: string;
let withAudio: string;
let silent: string;

beforeAll(async () => {
  dir = await makeTempDir();
  [withAudio, silent] = await Promise.all([
    makeVideo(dir, "a.mp4", { seconds: 8 }),
    makeVideo(dir, "s.mp4", { seconds: 3, audio: false }),
  ]);
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("convertVideoToSoundSticker", () => {
  it("produces ≤500 KB WebP + synced Opus audio", async () => {
    const r = await convertVideoToSoundSticker({
      input: withAudio,
      outDir: dir,
      name: "a",
      startSec: 1,
    });
    expect(r.stats.sticker.withinLimit).toBe(true);
    expect((await stat(r.webpPath)).size).toBeLessThanOrEqual(500 * 1024);
    expect(r.audioPath).toBeDefined();

    const audio = await probe(r.audioPath as string);
    expect(audio.audioCodec).toBe("opus");
    expect(
      Math.abs(audio.durationSec * 1000 - r.stats.sticker.durationMs),
    ).toBeLessThan(100);
  });

  it("warns and skips audio when source is silent", async () => {
    const r = await convertVideoToSoundSticker({
      input: silent,
      outDir: dir,
      name: "s",
      durationSec: 5,
    });
    expect(r.audioPath).toBeUndefined();
    expect(r.warnings.join(" ")).toMatch(/no tiene pista de audio/);
    expect(r.warnings.join(" ")).toMatch(/recortada/);
  });

  it("audio: none → no audio file", async () => {
    const r = await convertVideoToSoundSticker({
      input: withAudio,
      outDir: dir,
      name: "n",
      audio: "none",
    });
    expect(r.audioPath).toBeUndefined();
  });
});
