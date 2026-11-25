/**
 * Pixel-art sprites as text grids ("." = transparent, any other char = a
 * palette key). Rendering merges horizontal runs into single rects so a
 * 22×16 sprite is a few dozen SVG nodes, not hundreds.
 */
export type Palette = Record<string, string>;

export interface Run {
  x: number;
  y: number;
  w: number;
  key: string;
}

/** Grid → horizontal runs of same-colored pixels. Pure. */
export function toRuns(rows: readonly string[]): Run[] {
  const runs: Run[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const key = row[x] as string;
      if (key === ".") {
        x++;
        continue;
      }
      let w = 1;
      while (row[x + w] === key) w++;
      runs.push({ x, y, w, key });
      x += w;
    }
  });
  return runs;
}

export const gridSize = (rows: readonly string[]) => ({
  width: Math.max(...rows.map((r) => r.length)),
  height: rows.length,
});
