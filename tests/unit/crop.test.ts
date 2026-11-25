import { describe, expect, it } from "vitest";
import { buildVideoFilter } from "../../src/core/video/encodeVideo.js";
import {
  CENTERED,
  cropStyle,
  isCentered,
  overflow,
  panCrop,
  zoomCrop,
} from "../../web/src/features/converter/model/crop.js";

describe("free crop framing (web model)", () => {
  it("measures the overflow of a cover-scaled frame", () => {
    expect(overflow(16 / 9, 1).x).toBeCloseTo(16 / 9 - 1);
    expect(overflow(16 / 9, 1).y).toBe(0);
    expect(overflow(9 / 16, 2).y).toBeCloseTo(2 * (16 / 9) - 1);
    expect(overflow(1, 1)).toEqual({ x: 0, y: 0 });
  });

  it("pans with the finger and clamps to the edges", () => {
    // 16:9 at zoom 1 on a 100 px square overflows 77.8 px horizontally.
    const left = panCrop(CENTERED, 20, 0, 16 / 9, 100);
    expect(left.x).toBeLessThan(0.5); // dragging right reveals the left side
    expect(left.y).toBe(0.5); // no vertical overflow → stays centered
    expect(panCrop(CENTERED, 500, 0, 16 / 9, 100).x).toBe(0);
    expect(panCrop(CENTERED, -500, 0, 16 / 9, 100).x).toBe(1);
  });

  it("zoom stays within 1..4", () => {
    expect(zoomCrop(CENTERED, 9).zoom).toBe(4);
    expect(zoomCrop(CENTERED, 0.2).zoom).toBe(1);
    expect(isCentered(CENTERED)).toBe(true);
    expect(isCentered(zoomCrop(CENTERED, 1.5))).toBe(false);
  });

  it("CSS box matches the server's scale+crop", () => {
    expect(cropStyle({ x: 0.25, y: 1, zoom: 2 })).toEqual({
      width: "200%",
      height: "200%",
      left: "-25%",
      top: "-100%",
      objectPosition: "25% 100%",
    });
  });
});

describe("free crop framing (ffmpeg)", () => {
  it("keeps the plain center crop when untouched", () => {
    expect(buildVideoFilter("crop", 15, 512, undefined, { x: 0.5, y: 0.5, zoom: 1 })).toBe(buildVideoFilter("crop", 15, 512));
  });
  it("scales to size·zoom and crops at the chosen spot", () => {
    const f = buildVideoFilter("crop", 15, 512, undefined, { x: 0.25, y: 0.8, zoom: 1.5 });
    expect(f).toContain("scale=768:768:force_original_aspect_ratio=increase");
    expect(f).toContain("crop=512:512:(iw-ow)*0.25:(ih-oh)*0.8");
  });
  it("clamps hostile values", () => {
    const f = buildVideoFilter("crop", 15, 512, undefined, { x: 9, y: -3, zoom: 99 });
    expect(f).toContain("scale=2048:2048");
    expect(f).toContain("crop=512:512:(iw-ow)*1:(ih-oh)*0");
  });
});
