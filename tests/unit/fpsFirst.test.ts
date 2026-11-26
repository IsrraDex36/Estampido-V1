import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOOKS,
  type EncodeRequest,
  fitFpsFirst,
  type Look,
  roundFps,
} from "../../src/core/optimize/fpsFirst.js";

/**
 * Size model matching measurements: linear in fps × duration, weakly
 * dependent on quality (q75 ≈ 2× q12), and on detail (256 px ≈ 0.65× 512 px).
 */
const model =
  (bytesPerFrameAtQ75: number, log: EncodeRequest[] = []) =>
  async (req: EncodeRequest) => {
    log.push(req);
    const qFactor = 0.45 + (0.55 * req.quality) / 75;
    const dFactor = 0.3 + (0.7 * req.detail) / 512;
    return Math.round(bytesPerFrameAtQ75 * qFactor * dFactor * req.fps * req.durationSec);
  };
const KB500 = 500 * 1024;

describe("roundFps", () => {
  it.each([
    [14.9, 14],
    [2.4, 2],
    [1.9, 1.5],
    [0.74, 0.5],
  ])("%d → %d", (a, b) => expect(roundFps(a)).toBe(b));
});

describe("looks", () => {
  it("each look is lighter than the previous (needed for the binary search)", () => {
    for (let i = 1; i < DEFAULT_LOOKS.length; i++) {
      const [a, b] = [DEFAULT_LOOKS[i - 1] as Look, DEFAULT_LOOKS[i] as Look];
      expect(b.quality <= a.quality && b.detail <= a.detail).toBe(true);
      expect(b.quality < a.quality || b.detail < a.detail).toBe(true);
    }
  });
});

describe("fitFpsFirst — 14–15 fps standard", () => {
  it("light clip: 15 fps, best quality, full detail", async () => {
    const r = await fitFpsFirst(model(1000), { durationSec: 5, maxFps: 15, maxBytes: 80_000 });
    expect(r).toMatchObject({ fps: 15, detail: 512, withinLimit: true, belowStandard: false });
    expect(r.quality).toBeGreaterThanOrEqual(60);
  });

  it("busy 10 s clip: keeps ≥ 14 fps by lowering detail/quality instead of fps", async () => {
    const log: EncodeRequest[] = [];
    const r = await fitFpsFirst(model(9000, log), { durationSec: 10, maxFps: 15, maxBytes: KB500 });
    expect(r.withinLimit).toBe(true);
    expect(r.fps).toBeGreaterThanOrEqual(14);
    expect(r.belowStandard).toBe(false);
    expect(r.detail).toBeLessThan(512);
    // Probes are short samples; few full encodes.
    expect(log.filter((x) => !x.final).every((x) => x.durationSec <= 4)).toBe(true);
    expect(log.length).toBeLessThanOrEqual(8);
  });

  it("prefers 15 fps one step lighter over 14 fps", async () => {
    // Sized so the best look affords exactly 14 fps.
    const r = await fitFpsFirst(model(4200), { durationSec: 10, maxFps: 15, maxBytes: KB500 });
    expect(r.fps).toBe(15);
  });

  it("a slow source (10 fps GIF) keeps its own rate: never upsampled, not 'below standard'", async () => {
    const r = await fitFpsFirst(model(10), { durationSec: 5, maxFps: 10, maxBytes: 1e9 });
    expect(r).toMatchObject({ fps: 10, belowStandard: false });
  });

  it("too long for the limit even at the lightest look: drops below the standard, flagged, still fits", async () => {
    const log: EncodeRequest[] = [];
    const r = await fitFpsFirst(model(6000, log), {
      durationSec: 180,
      maxFps: 15,
      maxBytes: KB500,
      standardFps: 14,
      minFps: 0.5,
    });
    expect(r.withinLimit).toBe(true);
    expect(r.belowStandard).toBe(true);
    expect(r).toMatchObject({ quality: 5, detail: 256 }); // every other lever used first
    expect(r.fps).toBeGreaterThanOrEqual(0.5);
    expect(log.filter((x) => x.final).length).toBeLessThanOrEqual(3);
  });

  it("recovers when the sample underestimates (busier second half) without leaving the standard", async () => {
    const enc = async (req: EncodeRequest) => {
      const cheap = Math.min(req.durationSec, 4);
      const pricey = Math.max(0, req.durationSec - 4);
      const d = 0.3 + (0.7 * req.detail) / 512;
      return Math.round(300 * req.fps * d * (cheap + 1.6 * pricey) * (0.45 + (0.55 * req.quality) / 75));
    };
    const r = await fitFpsFirst(enc, { durationSec: 10, maxFps: 15, maxBytes: 40_000 });
    expect(r.withinLimit).toBe(true);
    expect(r.fps).toBeGreaterThanOrEqual(14);
  });

  it("short clip: the sample IS the final encode (no duplicate work)", async () => {
    const log: EncodeRequest[] = [];
    await fitFpsFirst(model(1000, log), { durationSec: 3, maxFps: 15, maxBytes: 1_000_000 });
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ final: true, durationSec: 3, fps: 15, quality: 75, detail: 512 });
  });

  it("the returned settings are the ones of the file left on disk", async () => {
    const log: EncodeRequest[] = [];
    const r = await fitFpsFirst(model(9000, log), { durationSec: 3, maxFps: 15, maxBytes: 150_000 });
    const lastFinal = log.filter((x) => x.final).at(-1);
    expect(lastFinal).toMatchObject({ quality: r.quality, detail: r.detail, fps: r.fps, durationSec: 3 });
  });
});
