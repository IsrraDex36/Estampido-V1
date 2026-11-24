import { readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { STICKER_LIMITS } from "../../src/config/limits.js";
import { probe } from "../../src/core/probe/probe.js";
import { encodeVideo } from "../../src/core/video/encodeVideo.js";
import { resolveSegment } from "../../src/core/video/segment.js";
import { inspectWebp, totalDurationMs } from "../../src/core/webp/inspect.js";
import { makeTempDir, makeVideo } from "../helpers/fixtures.js";

let dir: string;
let landscape: string;
let portrait: string;

beforeAll(async () => {
  dir = await makeTempDir();
  [landscape, portrait] = await Promise.all([
    makeVideo(dir, "landscape.mp4", { width: 640, height: 360, seconds: 8 }),
    makeVideo(dir, "portrait.mp4", {
      width: 360,
      height: 640,
      seconds: 3,
      audio: false,
    }),
  ]);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("probe (real ffprobe)", () => {
  it("reads landscape video with audio", async () => {
    const info = await probe(landscape);
    expect(info).toMatchObject({
      width: 640,
      height: 360,
      hasVideo: true,
      hasAudio: true,
    });
    expect(info.durationSec).toBeCloseTo(8, 0);
    expect(info.fps).toBeCloseTo(30);
  });
  it("detects missing audio", async () => {
    expect((await probe(portrait)).hasAudio).toBe(false);
  });
});

describe("encodeVideo → animated WebP", () => {
  it("landscape, padded: 512×512, 5 s, 15 fps uniform, alpha, loops", async () => {
    const out = join(dir, "landscape.webp");
    const seg = resolveSegment((await probe(landscape)).durationSec, 1);
    await encodeVideo({ input: landscape, output: out, ...seg });

    const info = inspectWebp(await readFile(out));
    expect(info.animated).toBe(true);
    expect(info.hasAlpha).toBe(true);
    expect(info.canvasWidth).toBe(512);
    expect(info.canvasHeight).toBe(512);
    expect(info.loopCount).toBe(0);
    expect(info.frames.length).toBe(5 * STICKER_LIMITS.defaultFps);
    expect(totalDurationMs(info)).toBeGreaterThanOrEqual(4900);
    expect(totalDurationMs(info)).toBeLessThanOrEqual(5100);

    // Uniform frame timing (≤1 ms jitter from ms rounding).
    const durations = info.frames.map((f) => f.durationMs);
    expect(Math.max(...durations) - Math.min(...durations)).toBeLessThanOrEqual(
      1,
    );

    const { size } = await stat(out);
    console.log(
      `landscape.webp: ${(size / 1024).toFixed(1)} KB, ${info.frames.length} frames`,
    );
  });

  it("clamps to short source and supports crop", async () => {
    const out = join(dir, "portrait.webp");
    const seg = resolveSegment((await probe(portrait)).durationSec);
    expect(seg.durationSec).toBeCloseTo(3, 1);
    await encodeVideo({ input: portrait, output: out, ...seg, fit: "crop" });

    const info = inspectWebp(await readFile(out));
    expect(info.canvasWidth).toBe(512);
    expect(info.frames.length).toBeGreaterThanOrEqual(44);
    expect(info.frames.length).toBeLessThanOrEqual(46);
  });
});
