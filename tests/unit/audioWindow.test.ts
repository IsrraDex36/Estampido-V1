import { describe, expect, it } from "vitest";
import {
  clipWindow,
  computePeaks,
  maxStartFor,
  startFromPointer,
} from "../../web/src/features/converter/model/audioWindow.js";

describe("sound window helpers", () => {
  it("computes normalized peaks per bar across channels", () => {
    const left = [0, 0.5, 0, 0.25, 0, 0, 0, 0];
    const right = [0, 0, 0, 0, 0, -1, 0, 0];
    expect(computePeaks([left, right], 4)).toEqual([0.5, 0.25, 1, 0]);
    expect(computePeaks([], 3)).toEqual([0, 0, 0]);
    expect(computePeaks([[0, 0, 0, 0]], 2)).toEqual([0, 0]); // silence stays flat
  });

  it("clamps a fixed window inside the audio", () => {
    expect(clipWindow(20, 3, 5, 10)).toEqual({ start: 3, length: 5 });
    expect(clipWindow(20, 18, 5, 10)).toEqual({ start: 15, length: 5 }); // pushed back to fit
    expect(clipWindow(4, 2, 5, 10)).toEqual({ start: 0, length: 4 }); // audio shorter than the sticker
    expect(clipWindow(0, 2, 5, 10)).toEqual({ start: 0, length: 0 });
  });

  it("auto window runs to the end, up to the limit", () => {
    expect(clipWindow(20, 4, undefined, 10)).toEqual({ start: 4, length: 10 });
    expect(clipWindow(20, 15, undefined, 10)).toEqual({ start: 15, length: 5 });
  });

  it("centers a fixed window on the pointer; auto starts there", () => {
    expect(startFromPointer(10, 20, 4)).toBe(8);
    expect(startFromPointer(0.5, 20, 4)).toBe(0);
    expect(startFromPointer(19.9, 20, 4)).toBe(16);
    expect(startFromPointer(7.33, 20, undefined)).toBe(7.3);
    expect(startFromPointer(20, 20, undefined)).toBe(19.5);
  });

  it("knows the latest valid start", () => {
    expect(maxStartFor(20, 5)).toBe(15);
    expect(maxStartFor(3, 5)).toBe(0);
    expect(maxStartFor(20, undefined)).toBe(19.5);
    expect(maxStartFor(0, 5)).toBe(0);
  });
});
