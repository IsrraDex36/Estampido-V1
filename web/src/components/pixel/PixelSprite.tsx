import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { gridSize, type Palette, toRuns } from "./sprite";

interface PixelSpriteProps {
  rows: readonly string[];
  palette: Palette;
  /** Rendered width in px (height keeps the grid's aspect). */
  size: number;
  className?: string;
  title?: string;
  /** Per palette key className (e.g. animate the eyes or the sound waves). */
  keyClassName?: Partial<Record<string, string>>;
}

/** Crisp SVG pixel art (no smoothing at any scale). */
export function PixelSprite({ rows, palette, size, className, title, keyClassName }: PixelSpriteProps) {
  const runs = useMemo(() => toRuns(rows), [rows]);
  const { width, height } = gridSize(rows);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={size}
      height={(size * height) / width}
      shapeRendering="crispEdges"
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {runs.map((r) => (
        <rect
          key={`${r.x}-${r.y}`}
          x={r.x}
          y={r.y}
          width={r.w}
          height={1}
          fill={palette[r.key] ?? "currentColor"}
          className={keyClassName?.[r.key]}
        />
      ))}
    </svg>
  );
}
