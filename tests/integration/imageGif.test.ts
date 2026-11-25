import { readFile, rm } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UserInputError } from "../../src/core/errors.js";
import { probe } from "../../src/core/probe/probe.js";
import { inspectWebp } from "../../src/core/webp/inspect.js";
import { convertToSoundSticker } from "../../src/pipeline/convert.js";
import {
  firstFramePixel,
  makeAnimatedWebp,
  makeGif,
  makeJpeg,
  makePng,
  makeTempDir,
  makeTone,
} from "../helpers/fixtures.js";

let dir: string;
let png: string;
let jpg: string;
let gif: string;
let awebp: string;
let tone3: string;
let tone15: string;

beforeAll(async () => {
  dir = await makeTempDir();
  [png, jpg, gif, awebp, tone3, tone15] = await Promise.all([
    makePng(dir),
    makeJpeg(dir),
    makeGif(dir),
    makeAnimatedWebp(dir),
    makeTone(dir, 3),
    makeTone(dir, 15),
  ]);
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const audioSec = async (p?: string) => (await probe(p as string)).durationSec;

describe("image + audio", () => {
  it("static WebP ≤ 100 KB with EXIF, transparency kept, full 3 s sound", async () => {
    const r = await convertToSoundSticker({ input: png, outDir: dir, name: "png", audio: { file: tone3 } });
    expect(r.kind).toBe("image");
    const info = inspectWebp(await readFile(r.webpPath));
    expect(info).toMatchObject({ animated: false, hasExif: true, canvasWidth: 512, canvasHeight: 512, hasAlpha: true });
    expect(r.stats.sticker).toMatchObject({ animated: false, withinLimit: true, maxBytes: 100 * 1024, frames: 1 });
    expect(await firstFramePixel(r.webpPath, 5, 5)).toEqual([0, 0, 0, 0]); // padded corner
    expect((await firstFramePixel(r.webpPath, 256, 256))[3]).toBe(255); // opaque red square
    expect(await audioSec(r.audioPath)).toBeCloseTo(3, 0);
    expect(r.stats.audio).toMatchObject({ origin: "file" });
  });

  it("caps sound at 10 s with a warning; respects explicit shorter duration", async () => {
    const capped = await convertToSoundSticker({ input: jpg, outDir: dir, name: "jpg", audio: { file: tone15 } });
    expect(await audioSec(capped.audioPath)).toBeCloseTo(10, 0);
    expect(capped.warnings.join(" ")).toMatch(/recortó a 10 s/);
    expect(capped.stats.sticker.bytes).toBeLessThanOrEqual(100 * 1024);

    const short = await convertToSoundSticker({
      input: jpg,
      outDir: dir,
      name: "jpg2",
      durationSec: 4,
      audio: { file: tone15, startSec: 2 },
    });
    expect(await audioSec(short.audioPath)).toBeCloseTo(4, 0);
    expect(short.stats.segment).toEqual({ startSec: 2, durationSec: 4 });
  });

  it("without audio: static sticker + hint; > 10 s rejected", async () => {
    const r = await convertToSoundSticker({ input: png, outDir: dir, name: "silent" });
    expect(r.audioPath).toBeUndefined();
    expect(r.warnings.join(" ")).toMatch(/no tienen sonido/);
    await expect(
      convertToSoundSticker({ input: png, outDir: dir, name: "x", durationSec: 11, audio: { file: tone15 } }),
    ).rejects.toBeInstanceOf(UserInputError);
  });
});

describe("GIF / animated WebP", () => {
  it("GIF → animated sticker, transparency preserved even in crop mode", async () => {
    const r = await convertToSoundSticker({ input: gif, outDir: dir, name: "gif", fit: "crop" });
    expect(r.kind).toBe("animated");
    const info = inspectWebp(await readFile(r.webpPath));
    expect(info.animated).toBe(true);
    expect(r.stats.sticker.durationMs).toBeGreaterThanOrEqual(1900);
    expect(r.stats.sticker.durationMs).toBeLessThanOrEqual(2100);
    // crop: 200×120 → scaled to 853×512, centered crop; corner was transparent in the GIF.
    expect((await firstFramePixel(r.webpPath, 2, 2))[3]).toBe(0);
    expect((await firstFramePixel(r.webpPath, 256, 256))[3]).toBe(255);
    expect(r.audioPath).toBeUndefined();
    expect(r.warnings.join(" ")).toMatch(/GIF/);
    // 10 fps source → not upsampled → uniform frame durations.
    expect(r.stats.sticker.fps).toBe(10);
    const durations = info.frames.map((f) => f.durationMs);
    expect(Math.max(...durations) - Math.min(...durations)).toBeLessThanOrEqual(1);
  });

  it("GIF + longer sound: animation 2 s loops, sound 5 s", async () => {
    const r = await convertToSoundSticker({ input: gif, outDir: dir, name: "gifvoz", audio: { file: tone15 } });
    expect(r.stats.sticker.durationMs).toBeLessThanOrEqual(2100);
    expect(await audioSec(r.audioPath)).toBeCloseTo(5, 0);
  });

  it("GIF + fullLength: uses the whole replacement sound (15 s), animation still 2 s", async () => {
    const r = await convertToSoundSticker({
      input: gif,
      outDir: dir,
      name: "giffull",
      audio: { file: tone15 },
      fullLength: true,
    });
    expect(r.stats.sticker.durationMs).toBeLessThanOrEqual(2100);
    expect(await audioSec(r.audioPath)).toBeCloseTo(15, 0);
  });

  it("animated WebP input is supported", async () => {
    const r = await convertToSoundSticker({ input: awebp, outDir: dir, name: "awebp", audio: { file: tone3 } });
    expect(r.kind).toBe("animated");
    expect(r.stats.sticker).toMatchObject({ fps: 10, frames: 20 }); // 2 s @ 10 fps source, not upsampled
    expect(await audioSec(r.audioPath)).toBeCloseTo(3, 0);
  });

  it("animated > max request rejected", async () => {
    await expect(convertToSoundSticker({ input: gif, outDir: dir, durationSec: 181 })).rejects.toThrow(/máximo 180 s/);
  });
});
