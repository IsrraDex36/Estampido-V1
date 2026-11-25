import { describe, expect, it } from "vitest";
import { centerSpanAt, dragTrim, hitTest, nudge } from "../../web/src/features/converter/model/trim.js";

const limits = { total: 60, min: 1, max: 10 };

describe("video trimmer model", () => {
  it("hit-tests grips, frame and outside", () => {
    const span = { start: 10, end: 15 };
    expect(hitTest(10.2, span, 0.5)).toBe("start");
    expect(hitTest(14.9, span, 0.5)).toBe("end");
    expect(hitTest(12, span, 0.5)).toBe("move");
    expect(hitTest(30, span, 0.5)).toBe("outside");
    expect(hitTest(10.4, { start: 10, end: 11 }, 0.6)).toBe("start"); // both in reach → nearest wins
  });

  it("start grip stops at min/max length and 0, never moving the end", () => {
    const span = { start: 10, end: 15 };
    expect(dragTrim("start", 12.34, 0, span, limits)).toEqual({ start: 12.3, end: 15 });
    expect(dragTrim("start", 14.8, 0, span, limits)).toEqual({ start: 14, end: 15 }); // min 1 s
    expect(dragTrim("start", 1, 0, span, limits)).toEqual({ start: 5, end: 15 }); // max 10 s
    expect(dragTrim("start", -3, 0, { start: 2, end: 6 }, limits)).toEqual({ start: 0, end: 6 });
  });

  it("end grip stops at min/max length and the clip end", () => {
    const span = { start: 10, end: 15 };
    expect(dragTrim("end", 18.06, 0, span, limits)).toEqual({ start: 10, end: 18.1 });
    expect(dragTrim("end", 10.2, 0, span, limits)).toEqual({ start: 10, end: 11 });
    expect(dragTrim("end", 40, 0, span, limits)).toEqual({ start: 10, end: 20 });
    expect(dragTrim("end", 99, 0, { start: 55, end: 58 }, limits)).toEqual({ start: 55, end: 60 });
  });

  it("moving the frame keeps its length inside the clip", () => {
    const span = { start: 10, end: 15 };
    expect(dragTrim("move", 22, 2, span, limits)).toEqual({ start: 20, end: 25 });
    expect(dragTrim("move", 1, 2, span, limits)).toEqual({ start: 0, end: 5 });
    expect(dragTrim("move", 70, 2, span, limits)).toEqual({ start: 55, end: 60 });
  });

  it("tap outside centers the frame there; keyboard nudges a grip", () => {
    expect(centerSpanAt(30, { start: 10, end: 14 }, 60)).toEqual({ start: 28, end: 32 });
    expect(centerSpanAt(59, { start: 10, end: 14 }, 60)).toEqual({ start: 56, end: 60 });
    expect(nudge("end", 1, { start: 10, end: 15 }, limits)).toEqual({ start: 10, end: 16 });
    expect(nudge("start", -0.1, { start: 10, end: 15 }, limits)).toEqual({ start: 9.9, end: 15 });
  });
});
