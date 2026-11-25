import { describe, expect, it } from "vitest";
import { type EncodeRequest, fitFpsFirst, roundFps } from "../../src/core/optimize/fpsFirst.js";

/**
 * Size model matching measurements: linear in fps × duration, weakly
 * dependent on quality (q75 ≈ 2× q12).
 */
const model =
  (bytesPerFrameAtQ75: number, log: EncodeRequest[] = []) =>
  async (req: EncodeRequest) => {
    log.push(req);
    const qFactor = 0.45 + (0.55 * req.quality) / 75;
    return Math.round(bytesPerFrameAtQ75 * qFactor * req.fps * req.durationSec);
  };

describe("roundFps", () => {
  it.each([
    [14.9, 14],
    [2.4, 2],
    [1.9, 1.5],
    [0.74, 0.5],
  ])("%d → %d", (a, b) => expect(roundFps(a)).toBe(b));
});

describe("fitFpsFirst", () => {
  it("keeps full fps and picks the best quality that fits", async () => {
    const r = await fitFpsFirst(model(1000), { durationSec: 5, maxFps: 15, maxBytes: 80_000 });
    expect(r.fps).toBe(15);
    expect(r.withinLimit).toBe(true);
    expect(r.quality).toBeGreaterThanOrEqual(60);
  });

  it("solves the highest fps that fits instead of stepping down blindly", async () => {
    const log: EncodeRequest[] = [];
    const maxBytes = 500 * 1024;
    const r = await fitFpsFirst(model(9000, log), { durationSec: 10, maxFps: 15, maxBytes });
    expect(r.withinLimit).toBe(true);
    // Optimal fps for the floor quality under the model: budget / bytes-per-frame.
    const perFrameAtQ20 = 9000 * (0.45 + (0.55 * 20) / 75) * 10;
    expect(r.fps).toBeGreaterThanOrEqual(Math.floor((maxBytes * 0.9) / perFrameAtQ20));
    // Probes are short samples; only finals cover the whole clip.
    expect(log.filter((x) => !x.final).every((x) => x.durationSec <= 4)).toBe(true);
  });

  it("3-minute clip: few full encodes, ends within budget", async () => {
    const log: EncodeRequest[] = [];
    const r = await fitFpsFirst(model(6000, log), { durationSec: 180, maxFps: 15, maxBytes: 500 * 1024 });
    expect(r.withinLimit).toBe(true);
    expect(r.fps).toBeGreaterThanOrEqual(0.5);
    expect(log.filter((x) => x.final).length).toBeLessThanOrEqual(3);
  });

  it("recovers when the sample underestimates (busier second half)", async () => {
    // First 4 s cheap, rest 3× pricier → probe says it fits, full encode doesn't.
    const enc = async (req: EncodeRequest) => {
      const cheap = Math.min(req.durationSec, 4);
      const pricey = Math.max(0, req.durationSec - 4);
      return Math.round(300 * req.fps * (cheap + 3 * pricey) * (0.45 + (0.55 * req.quality) / 75));
    };
    const r = await fitFpsFirst(enc, { durationSec: 20, maxFps: 15, maxBytes: 60_000 });
    expect(r.withinLimit).toBe(true);
  });

  it("short clip: the sample IS the final encode (no duplicate work)", async () => {
    const log: EncodeRequest[] = [];
    await fitFpsFirst(model(1000, log), { durationSec: 3, maxFps: 15, maxBytes: 1_000_000 });
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ final: true, durationSec: 3, fps: 15, quality: 75 });
  });

  it("never exceeds maxFps (source cap)", async () => {
    const r = await fitFpsFirst(model(10), { durationSec: 5, maxFps: 10, maxBytes: 1e9 });
    expect(r.fps).toBe(10);
  });
});
