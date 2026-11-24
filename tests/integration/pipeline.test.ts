import { spawnSync } from "node:child_process";
import { readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UserInputError } from "../../src/core/errors.js";
import { parseStickerExif } from "../../src/core/metadata/stickerExif.js";
import { probe } from "../../src/core/probe/probe.js";
import { readExif } from "../../src/core/webp/chunks.js";
import { inspectWebp } from "../../src/core/webp/inspect.js";
import { convertVideoToSoundSticker } from "../../src/pipeline/convert.js";
import { ffmpegPath, run } from "../../src/utils/ffmpeg.js";
import { makeTempDir, makeVideo } from "../helpers/fixtures.js";

let dir: string;
let withAudio: string;
let silent: string;
let voice: string;

beforeAll(async () => {
  dir = await makeTempDir();
  [withAudio, silent] = await Promise.all([
    makeVideo(dir, "a.mp4", { seconds: 8 }),
    makeVideo(dir, "s.mp4", { seconds: 3, audio: false }),
  ]);
  voice = join(dir, "voice.m4a");
  await run(ffmpegPath(), [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880:duration=8",
    "-c:a",
    "aac",
    voice,
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
    expect(Math.abs(audio.durationSec * 1000 - r.stats.sticker.durationMs)).toBeLessThan(100);
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

  it("replacement audio file: works even for a silent video, from its own offset", async () => {
    const r = await convertVideoToSoundSticker({
      input: silent,
      outDir: dir,
      name: "v",
      audio: { file: voice, startSec: 2 },
    });
    expect(r.stats.audio?.origin).toBe("file");
    expect(r.warnings.join(" ")).not.toMatch(/no tiene pista de audio/);
    const audio = await probe(r.audioPath as string);
    expect(Math.abs(audio.durationSec * 1000 - r.stats.sticker.durationMs)).toBeLessThan(100);
  });

  it("rejects replacement without sound, or offset beyond it, before encoding", async () => {
    await expect(
      convertVideoToSoundSticker({
        input: withAudio,
        outDir: dir,
        name: "x",
        audio: { file: silent },
      }),
    ).rejects.toThrow(/no tiene sonido/);
    await expect(
      convertVideoToSoundSticker({
        input: withAudio,
        outDir: dir,
        name: "x",
        audio: { file: voice, startSec: 99 },
      }),
    ).rejects.toBeInstanceOf(UserInputError);
  });

  it("unreadable input → UserInputError", async () => {
    await expect(convertVideoToSoundSticker({ input: join(dir, "nope.mp4"), outDir: dir })).rejects.toBeInstanceOf(
      UserInputError,
    );
  });

  it("embeds pack/author metadata without breaking the animation; webpmux agrees", async () => {
    const r = await convertVideoToSoundSticker({
      input: withAudio,
      outDir: dir,
      name: "meta",
      durationSec: 2,
      metadata: { packName: "Mi pack", publisher: "Isra", emojis: ["🔊"] },
    });
    const buf = await readFile(r.webpPath);
    expect(buf.length).toBe(r.stats.sticker.bytes);
    expect(r.stats.sticker.withinLimit).toBe(true);
    const info = inspectWebp(buf);
    expect(info).toMatchObject({ animated: true, hasExif: true, canvasWidth: 512 });
    expect(info.frames.length).toBe(30);
    expect(parseStickerExif(readExif(buf) as Buffer)).toEqual(r.stats.sticker.metadata);

    // Cross-check with libwebp's own tool (if installed): valid container + same EXIF bytes.
    if (spawnSync("webpmux", ["-version"]).status !== 0) return;
    const exifOut = join(dir, "meta.exif");
    await run("webpmux", ["-get", "exif", r.webpPath, "-o", exifOut]);
    expect((await readFile(exifOut)).equals(readExif(buf) as Buffer)).toBe(true);
  });

  it("metadata: false → no EXIF", async () => {
    const r = await convertVideoToSoundSticker({
      input: withAudio,
      outDir: dir,
      name: "nometa",
      durationSec: 1,
      metadata: false,
    });
    expect(inspectWebp(await readFile(r.webpPath)).hasExif).toBe(false);
    expect(r.stats.sticker.metadata).toBeNull();
  });

  it("invalid metadata fails before encoding", async () => {
    await expect(
      convertVideoToSoundSticker({ input: withAudio, outDir: dir, name: "bad", metadata: { emojis: ["no"] } }),
    ).rejects.toBeInstanceOf(UserInputError);
  });
});
