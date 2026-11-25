import { describe, expect, it } from "vitest";
import { formatTime, parseTime, presetLabel, smoothnessFor } from "../../web/src/lib/time.js";

describe("parseTime", () => {
  it.each([
    ["90", 90],
    ["90.5", 90.5],
    ["1,5", 1.5],
    ["1:30", 90],
    ["1:30.5", 90.5],
    ["0:05", 5],
    ["3:00", 180],
    ["1:02:05", 3725],
    [" 2:00 ", 120],
  ])("%s → %d", (input, sec) => {
    expect(parseTime(input)).toBe(sec);
  });
  it.each(["", "abc", "1:60", "1:2:3:4", "-5", "1:", ":30", "1:61:00"])("rejects %j", (input) => {
    expect(parseTime(input)).toBeNull();
  });
});

describe("formatTime", () => {
  it.each([
    [0, "0:00"],
    [5, "0:05"],
    [90.5, "1:30.5"],
    [180, "3:00"],
    [3725, "1:02:05"],
    [4.04, "0:04"],
  ])("%d → %s", (sec, text) => {
    expect(formatTime(sec)).toBe(text);
  });
  it("round-trips", () => {
    for (const s of [0, 1.5, 59.9, 61, 179.9]) expect(parseTime(formatTime(s))).toBeCloseTo(s, 1);
  });
});

describe("presets & smoothness", () => {
  it("labels", () => {
    expect([3, 30, 60, 90, 180].map(presetLabel)).toEqual(["3 s", "30 s", "1 min", "1:30", "3 min"]);
  });
  it("tiers (hq ≈ 10× budget)", () => {
    expect(smoothnessFor(5, false)).toBe("fluid");
    expect(smoothnessFor(30, false)).toBe("reduced");
    expect(smoothnessFor(180, false)).toBe("slideshow");
    expect(smoothnessFor(180, true)).toBe("reduced");
    expect(smoothnessFor(60, true)).toBe("fluid");
  });
});
