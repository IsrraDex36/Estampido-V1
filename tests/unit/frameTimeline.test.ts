import { describe, expect, it } from "vitest";
import { buildTimeline, frameAt } from "../../web/src/lib/frameTimeline.js";

describe("animated sticker timeline (picture follows the sound)", () => {
  it("builds frame starts; bad durations fall back to 100 ms", () => {
    expect(buildTimeline([100, 100, 200])).toEqual({ starts: [0, 100, 200], total: 400 });
    expect(buildTimeline([0, Number.NaN, 50])).toEqual({ starts: [0, 100, 200], total: 250 });
  });

  it("finds the frame for a time, looping like a sticker", () => {
    const tl = buildTimeline([100, 100, 200]); // 0–100, 100–200, 200–400
    expect(frameAt(tl, 0)).toBe(0);
    expect(frameAt(tl, 99.9)).toBe(0);
    expect(frameAt(tl, 100)).toBe(1);
    expect(frameAt(tl, 399)).toBe(2);
    expect(frameAt(tl, 400)).toBe(0); // loops
    expect(frameAt(tl, 1250)).toBe(0); // 1250 % 400 = 50 → first frame
    expect(frameAt(tl, 1330)).toBe(1); // 130 → second frame
  });

  it("single frame / empty → 0; negative times wrap", () => {
    expect(frameAt(buildTimeline([80]), 5000)).toBe(0);
    expect(frameAt(buildTimeline([]), 10)).toBe(0);
    expect(frameAt(buildTimeline([100, 100]), -50)).toBe(1);
  });
});
