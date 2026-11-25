import { describe, expect, it } from "vitest";
import { NOTE, SPARK, STAR, WAVE } from "../../web/src/components/pixel/sprites.js";
import { gridSize, toRuns } from "../../web/src/components/pixel/sprite.js";

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

  it("mascot grid is 22×16 and every row is the same width", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../../web/src/components/pixel/Mascot.tsx", import.meta.url), "utf8"),
    );
    const block = src.slice(src.indexOf("const ROWS = ["), src.indexOf("];", src.indexOf("const ROWS = [")));
    const rows = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1] as string);
    expect(rows).toHaveLength(16);
    expect(new Set(rows.map((r) => r.length))).toEqual(new Set([22]));
    // fewer rects than pixels (runs merged)
    const pixels = rows.join("").replace(/\./g, "").length;
    expect(toRuns(rows).length).toBeLessThan(pixels / 2);
  });
});
