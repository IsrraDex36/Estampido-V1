/**
 * Free framing for «Llenar»: the square's position (0..1 across the overflow)
 * and zoom over a cover-scaled frame. Same math as the server's
 * scale+crop, so the preview matches the sticker. Pure.
 */

export interface CropFrame {
  x: number;
  y: number;
  zoom: number;
}
export const CENTERED: CropFrame = { x: 0.5, y: 0.5, zoom: 1 };
export const MAX_ZOOM = 4;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** How much the cover-scaled frame overflows the square, in square-sides (0 = none). */
export function overflow(aspect: number, zoom: number): { x: number; y: number } {
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  return { x: zoom * Math.max(1, a) - 1, y: zoom * Math.max(1, 1 / a) - 1 };
}

/** Drag by (dx, dy) px on a `boxPx` square: the picture follows the finger. */
export function panCrop(frame: CropFrame, dx: number, dy: number, aspect: number, boxPx: number): CropFrame {
  const o = overflow(aspect, frame.zoom);
  const x = o.x > 0 ? frame.x - dx / (o.x * boxPx) : 0.5;
  const y = o.y > 0 ? frame.y - dy / (o.y * boxPx) : 0.5;
  return { ...frame, x: r4(clamp(x, 0, 1)), y: r4(clamp(y, 0, 1)) };
}

export function zoomCrop(frame: CropFrame, zoom: number): CropFrame {
  return { ...frame, zoom: Math.round(clamp(zoom, 1, MAX_ZOOM) * 100) / 100 };
}

/**
 * CSS for the media inside the square (as % of the square): a zoom×zoom box
 * shifted by the overflow, with object-fit cover at the same position.
 */
export function cropStyle(frame: CropFrame): {
  width: string;
  height: string;
  left: string;
  top: string;
  objectPosition: string;
} {
  const z = clamp(frame.zoom, 1, MAX_ZOOM);
  const pct = (n: number) => `${Math.round(n * 10000) / 100}%`;
  return {
    width: pct(z),
    height: pct(z),
    left: pct(-(z - 1) * frame.x),
    top: pct(-(z - 1) * frame.y),
    objectPosition: `${pct(frame.x)} ${pct(frame.y)}`,
  };
}

export const isCentered = (f: CropFrame) => f.zoom <= 1 && f.x === 0.5 && f.y === 0.5;
