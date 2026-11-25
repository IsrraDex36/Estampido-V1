import { describe, expect, it } from "vitest";
import { gridSize, toRuns } from "../../web/src/components/pixel/sprite.js";
import { NOTE, SPARK, STAR, WAVE } from "../../web/src/components/pixel/sprites.js";

describe("pixel sprite engine", () => {
  it("merges horizontal same-color runs and skips transparent pixels", () => {
    expect(toRuns(["kk.ww", ".kkk."])).toEqual([
      { x: 0, y: 0, w: 2, key: "k" },
      { x: 3, y: 0, w: 2, key: "w" },
      { x: 1, y: 1, w: 3, key: "k" },
    ]);
    expect(gridSize(["abc", "a"])).toEqual({ width: 3, height: 2 });
  });

  it("decorative sprites are rectangular grids", () => {
    for (const rows of [NOTE, STAR, SPARK, WAVE]) {
      expect(new Set(rows.map((r) => r.length)).size).toBe(1);
    }
  });

  it("compose places parts; '.' never overwrites; clips to the canvas", async () => {
    const { compose } = await import("../../web/src/components/pixel/sprite.js");
    expect(
      compose(4, 2, [
        { rows: ["ab"], x: 0, y: 0 },
        { rows: [".c"], x: 0, y: 0 },
        { rows: ["zz"], x: 3, y: 1 },
      ]),
    ).toEqual(["ac..", "...z"]);
  });

  it("Pum layers share the canvas size and keep body/hands/waves apart", async () => {
    const { PUM_LAYERS, PUM_W, PUM_H } = await import("../../web/src/components/pixel/pum.js");
    for (const rows of Object.values(PUM_LAYERS)) {
      expect(rows).toHaveLength(PUM_H);
      expect(new Set(rows.map((r) => r.length))).toEqual(new Set([PUM_W]));
    }
    // dancing frames differ (arms move), waves only on the right
    expect(PUM_LAYERS.handsA).not.toEqual(PUM_LAYERS.handsB);
    const waveCols = PUM_LAYERS.waves.flatMap((r) => [...r].map((c, x) => (c === "." ? -1 : x))).filter((x) => x >= 0);
    expect(Math.min(...waveCols)).toBeGreaterThan(20);
    // merged runs → far fewer rects than pixels
    const pixels = PUM_LAYERS.base.join("").replace(/\./g, "").length;
    expect(toRuns(PUM_LAYERS.base).length).toBeLessThan(pixels / 2);
  });
});
