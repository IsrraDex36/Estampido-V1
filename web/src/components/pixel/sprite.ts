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

export interface Placement {
  rows: readonly string[];
  x: number;
  y: number;
}

/**
 * Compose small sprites onto a blank width×height canvas (later placements
 * win; "." never overwrites). Lets complex characters be authored as parts
 * (body, arms, mouth…) instead of hand-aligned full-width strings. Pure.
 */
export function compose(width: number, height: number, placements: readonly Placement[]): string[] {
  const grid = Array.from({ length: height }, () => Array<string>(width).fill("."));
  for (const { rows, x, y } of placements) {
    rows.forEach((row, dy) => {
      [...row].forEach((ch, dx) => {
        const gy = y + dy;
        const gx = x + dx;
        if (ch !== "." && gy >= 0 && gy < height && gx >= 0 && gx < width) (grid[gy] as string[])[gx] = ch;
      });
    });
  }
  return grid.map((r) => r.join(""));
}
