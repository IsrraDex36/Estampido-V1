import { describe, expect, it } from "vitest";
import { resolveSegment } from "../../src/core/video/segment.js";

describe("resolveSegment", () => {
  it("defaults to 5 s from 0", () => {
    expect(resolveSegment(20)).toEqual({ startSec: 0, durationSec: 5 });
  });
  it("clamps to remaining source", () => {
    expect(resolveSegment(6, 3, 5)).toEqual({ startSec: 3, durationSec: 3 });
  });
  it("throws when start beyond source", () => {
    expect(() => resolveSegment(4, 4)).toThrow(/beyond/);
  });
  it("rejects bad input", () => {
    expect(() => resolveSegment(10, -1)).toThrow();
    expect(() => resolveSegment(10, 0, 0)).toThrow();
  });
});
