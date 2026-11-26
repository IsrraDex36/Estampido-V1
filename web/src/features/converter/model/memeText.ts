/**
 * Meme text over the sticker: top and/or bottom captions, drawn on a
 * transparent canvas at the sticker's size. The SAME image is shown in the
 * preview and uploaded (`overlay`), so what you see is exactly what you get.
 * Layout is pure (measure injected) and unit-tested.
 */
export const TEXT_SIZES = { s: 44, m: 60, l: 80 } as const;
export type TextSize = keyof typeof TEXT_SIZES;

export const TEXT_COLORS = [
  { value: "#ffffff", label: "Blanco" },
  { value: "#ffd23f", label: "Amarillo" },
  { value: "#000000", label: "Negro" },
  { value: "#ff3366", label: "Rosa" },
  { value: "#2ecc71", label: "Verde" },
  { value: "#3d7dff", label: "Azul" },
] as const;
export type TextColor = (typeof TEXT_COLORS)[number]["value"];

export const TEXT_FONTS = {
  classic: { label: "Clásica", family: '"Geist Variable", system-ui, sans-serif', weight: 900 },
  pixel: { label: "Pixel", family: '"Silkscreen", ui-monospace, monospace', weight: 400 },
} as const;
export type TextFont = keyof typeof TEXT_FONTS;

export interface MemeText {
  top: string;
  bottom: string;
  size: TextSize;
  color: TextColor;
  font: TextFont;
  /** MAYÚSCULAS, like classic memes. */
  caps: boolean;
}

export const MAX_TEXT_CHARS = 80;
export const MAX_LINES = 3;
const MIN_FONT_PX = 22;

export const EMPTY_TEXT: MemeText = { top: "", bottom: "", size: "m", color: "#ffffff", font: "classic", caps: true };

export const hasText = (t: MemeText): boolean => t.top.trim() !== "" || t.bottom.trim() !== "";

/** Normalize one caption: no control chars, single spaces, capped, optional caps. Pure. */
export function cleanCaption(raw: string, caps: boolean): string {
  // Line breaks/tabs become spaces (words must not glue together); other control chars go.
  const s = [...raw]
    .map((ch) => ((ch.codePointAt(0) ?? 0) >= 32 ? ch : /\s/.test(ch) ? " " : ""))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
  return caps ? s.toLocaleUpperCase("es-MX") : s;
}

/** Outline that reads on anything: dark around light text, light around black. */
export const outlineFor = (color: TextColor): string => (color === "#000000" ? "#ffffff" : "#000000");

/**
 * Greedy word wrap into lines no wider than `maxWidth`; a word too long for
 * one line is split by characters. Pure.
 */
export function wrapLines(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ").filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    // The word alone may still be too wide: cut it.
    let rest = word;
    while (measure(rest) > maxWidth && rest.length > 1) {
      let cut = rest.length - 1;
      while (cut > 1 && measure(rest.slice(0, cut)) > maxWidth) cut--;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Biggest font (≤ the chosen size) at which the caption fits in MAX_LINES
 * lines. Returns the px and the lines. Pure (`measureAt(px)` gives a measurer).
 */
export function fitCaption(
  text: string,
  wantedPx: number,
  maxWidth: number,
  measureAt: (px: number) => (s: string) => number,
): { px: number; lines: string[] } {
  let px = wantedPx;
  for (;;) {
    const lines = wrapLines(text, maxWidth, measureAt(px));
    if (lines.length <= MAX_LINES || px <= MIN_FONT_PX) return { px, lines: lines.slice(0, MAX_LINES) };
    px = Math.max(MIN_FONT_PX, Math.floor(px * 0.88));
  }
}

/** Draw the captions on a `size`² canvas context (transparent elsewhere). */
export function drawMemeText(ctx: CanvasRenderingContext2D, t: MemeText, size: number): void {
  const scale = size / 512;
  const font = TEXT_FONTS[t.font];
  const pad = 16 * scale;
  const maxWidth = size - pad * 2;
  const setFont = (px: number) => {
    ctx.font = `${font.weight} ${px}px ${font.family}`;
  };
  const measureAt = (px: number) => {
    setFont(px);
    return (s: string) => ctx.measureText(s).width;
  };
  ctx.clearRect(0, 0, size, size);
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  for (const [which, raw] of [
    ["top", t.top],
    ["bottom", t.bottom],
  ] as const) {
    const text = cleanCaption(raw, t.caps);
    if (!text) continue;
    const { px, lines } = fitCaption(text, TEXT_SIZES[t.size] * scale, maxWidth, measureAt);
    setFont(px);
    const lineH = px * 1.05;
    ctx.lineWidth = Math.max(3, px * 0.18);
    ctx.strokeStyle = outlineFor(t.color);
    ctx.fillStyle = t.color;
    // Top block hangs from the top edge; bottom block sits on the bottom edge.
    ctx.textBaseline = which === "top" ? "top" : "bottom";
    lines.forEach((line, i) => {
      const y = which === "top" ? pad + i * lineH : size - pad - (lines.length - 1 - i) * lineH;
      ctx.strokeText(line, size / 2, y, maxWidth);
      ctx.fillText(line, size / 2, y, maxWidth);
    });
  }
}

/** Make sure the caption font is ready before drawing (else the canvas falls back silently). */
async function fontReady(t: MemeText): Promise<void> {
  const f = TEXT_FONTS[t.font];
  try {
    await document.fonts?.load(`${f.weight} 48px ${f.family}`, "AÁÑ");
  } catch {
    // best effort
  }
}

/** The overlay PNG for upload, or null when there's no text. */
export async function renderMemeText(t: MemeText, size = 512): Promise<Blob | null> {
  if (!hasText(t)) return null;
  await fontReady(t);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  drawMemeText(ctx, t, size);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}
