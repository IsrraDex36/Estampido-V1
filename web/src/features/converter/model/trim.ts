/**
 * Video trimmer (WhatsApp/Instagram style): a frame over the filmstrip with
 * two handles. Pure → tested from the root suite.
 */

export interface Span {
  start: number;
  end: number;
}
export type TrimDrag = "start" | "end" | "move";
export interface TrimLimits {
  /** Source length (s). */
  total: number;
  min: number;
  max: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

/** What a press at `at` seconds grabs: a handle (within `tol`), the frame, or nothing. */
export function hitTest(at: number, span: Span, tol: number): TrimDrag | "outside" {
  const dStart = Math.abs(at - span.start);
  const dEnd = Math.abs(at - span.end);
  if (dStart <= tol || dEnd <= tol) return dStart < dEnd ? "start" : "end";
  return at > span.start && at < span.end ? "move" : "outside";
}

/**
 * New span while dragging. Handles stop at the limits (they never push the
 * other side); "move" keeps the length, `offset` = where the frame was grabbed.
 */
export function dragTrim(mode: TrimDrag, at: number, offset: number, span: Span, { total, min, max }: TrimLimits): Span {
  const len = span.end - span.start;
  if (mode === "move") {
    const start = clamp(at - offset, 0, Math.max(0, total - len));
    return { start: round1(start), end: round1(start + len) };
  }
  if (mode === "start") {
    const start = clamp(at, Math.max(0, span.end - max), Math.max(0, span.end - min));
    return { start: round1(start), end: span.end };
  }
  const end = clamp(at, Math.min(total, span.start + min), Math.min(total, span.start + max));
  return { start: span.start, end: round1(end) };
}

/** Tap outside the frame: move it (same length) so it's centered there. */
export function centerSpanAt(at: number, span: Span, total: number): Span {
  const len = Math.min(span.end - span.start, total);
  const start = clamp(at - len / 2, 0, Math.max(0, total - len));
  return { start: round1(start), end: round1(start + len) };
}

/** Keyboard nudge of one handle by `delta` seconds, within the same limits. */
export function nudge(handle: "start" | "end", delta: number, span: Span, limits: TrimLimits): Span {
  const at = (handle === "start" ? span.start : span.end) + delta;
  return dragTrim(handle, at, 0, span, limits);
}
