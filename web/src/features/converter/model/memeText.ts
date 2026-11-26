import { loadTextFont } from "./textFonts";

/**
 * Meme text over the sticker: top and/or bottom captions, drawn on a
 * transparent canvas at the sticker's size. The SAME image is shown in the
 * preview and uploaded (`overlay`), so what you see is exactly what you get.
 * Layout is pure (measure injected) and unit-tested.
 */
export const TEXT_SIZES = { s: 44, m: 60, l: 80 } as const;
export type TextSize = keyof typeof TEXT_SIZES;

/** Quick picks; any #rrggbb works (custom picker). */
export const TEXT_COLORS = [
  { value: "#ffffff", label: "Blanco" },
  { value: "#ffd23f", label: "Amarillo" },
  { value: "#000000", label: "Negro" },
  { value: "#ff3366", label: "Rosa" },
  { value: "#ff8a00", label: "Naranja" },
  { value: "#2ecc71", label: "Verde" },
  { value: "#3d7dff", label: "Azul" },
  { value: "#a855f7", label: "Morado" },
] as const;
export type TextColor = `#${string}`;
export const isHexColor = (v: string): v is TextColor => /^#[0-9a-fA-F]{6}$/.test(v);

/**
 * Typefaces (CapCut-style variety, each with a clear personality). Files are
 * loaded only when the Texto tab is used (see fonts.ts).
 */
export const TEXT_FONTS = {
  classic: { label: "Clásica", family: '"Geist Variable", system-ui, sans-serif', weight: 900 },
  impact: { label: "Impacto", family: '"Anton", "Geist Variable", sans-serif', weight: 400 },
  comic: { label: "Cómic", family: '"Bangers", "Geist Variable", sans-serif', weight: 400 },
  bubbly: { label: "Gordita", family: '"Luckiest Guy", "Geist Variable", sans-serif', weight: 400 },
  poster: { label: "Póster", family: '"Bebas Neue", "Geist Variable", sans-serif', weight: 400 },
  marker: { label: "Plumón", family: '"Permanent Marker", "Geist Variable", sans-serif', weight: 400 },
  script: { label: "Cursiva", family: '"Pacifico", "Geist Variable", cursive', weight: 400 },
  pixel: { label: "Pixel", family: '"Silkscreen", ui-monospace, monospace', weight: 400 },
} as const;
export type TextFont = keyof typeof TEXT_FONTS;

/** How the letters stand out from the picture. */
export const TEXT_STYLES = {
  outline: "Contorno",
  shadow: "Sombra",
  box: "Caja",
  neon: "Neón",
} as const;
export type TextStyle = keyof typeof TEXT_STYLES;

/** Center of a layer, as fractions of the canvas (0..1). */
export interface LayerPos {
  x: number;
  y: number;
}

/** An emoji placed on the sticker. `size` = fraction of the canvas side. */
export interface EmojiLayer {
  id: string;
  char: string;
  x: number;
  y: number;
  size: number;
}

export const MAX_EMOJIS = 6;
export const EMOJI_SIZE = { min: 0.08, max: 0.5, initial: 0.22 } as const;
export const QUICK_EMOJIS = ["😂", "🤣", "😭", "💀", "🔥", "😎", "🥵", "🤡", "👀", "💯", "❤️", "👍", "🙏", "😡", "🤯", "✨"] as const;

export interface MemeText {
  top: string;
  bottom: string;
  /** Dragged position of each caption (absent → classic top / bottom). */
  topPos?: LayerPos;
  bottomPos?: LayerPos;
  emojis: EmojiLayer[];
  size: TextSize;
  color: TextColor;
  font: TextFont;
  style: TextStyle;
  /** MAYÚSCULAS, like classic memes. */
  caps: boolean;
}

export const MAX_TEXT_CHARS = 80;
export const MAX_LINES = 3;
const MIN_FONT_PX = 22;

export const EMPTY_TEXT: MemeText = {
  top: "",
  bottom: "",
  size: "m",
  color: "#ffffff",
  font: "classic",
  style: "outline",
  caps: true,
  emojis: [],
};

/** Anything to draw (captions or emojis)? */
export const hasLayers = (t: MemeText): boolean => hasText(t) || t.emojis.length > 0;

/** Keep a position on the canvas. Pure. */
export const clampPos = (p: LayerPos): LayerPos => ({
  x: Math.min(1, Math.max(0, p.x)),
  y: Math.min(1, Math.max(0, p.y)),
});

/** Box drawn for a layer (canvas px), used to pick what a finger grabs. */
export interface LayerBox {
  layer: { kind: "top" | "bottom" } | { kind: "emoji"; id: string };
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Topmost layer under a point (emojis are drawn last, so they win). Pure. */
export function layerAt(boxes: readonly LayerBox[], x: number, y: number, slop = 0): LayerBox | null {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i] as LayerBox;
    if (x >= b.x - slop && x <= b.x + b.w + slop && y >= b.y - slop && y <= b.y + b.h + slop) return b;
  }
  return null;
}

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

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

/** Relative luminance (sRGB) of #rrggbb, 0..1. Pure. */
export function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
}

/** Outline/box color that reads against the fill: dark for light colors, white for dark ones. */
export const outlineFor = (color: string): string => (isHexColor(color) && luminance(color) < 0.18 ? "#ffffff" : "#000000");

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
export function drawMemeText(ctx: CanvasRenderingContext2D, t: MemeText, size: number): LayerBox[] {
  const scale = size / 512;
  const font = TEXT_FONTS[t.font];
  const pad = 16 * scale;
  const maxWidth = size - pad * 2;
  const boxes: LayerBox[] = [];
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
  for (const [which, raw, pos] of [
    ["top", t.top, t.topPos],
    ["bottom", t.bottom, t.bottomPos],
  ] as const) {
    const text = cleanCaption(raw, t.caps);
    if (!text) continue;
    const { px, lines } = fitCaption(text, TEXT_SIZES[t.size] * scale, maxWidth - (t.style === "box" ? px0(scale) : 0), measureAt);
    setFont(px);
    const lineH = px * (t.style === "box" ? 1.22 : 1.05);
    const blockH = lines.length * lineH;
    const contrast = outlineFor(t.color);
    const widest = Math.min(maxWidth, Math.max(...lines.map((l) => ctx.measureText(l).width)) + (t.style === "box" ? px * 0.5 : 0));
    // Classic: top block hangs from the top edge, bottom sits on the bottom edge.
    // Dragged: the block is centered on its position, kept inside the canvas.
    const cx = pos ? Math.min(size - pad - widest / 2, Math.max(pad + widest / 2, pos.x * size)) : size / 2;
    const top = pos
      ? Math.min(size - pad - blockH, Math.max(pad, pos.y * size - blockH / 2))
      : which === "top"
        ? pad
        : size - pad - blockH;
    ctx.textBaseline = "top";
    lines.forEach((line, i) => {
      drawLine(ctx, t, line, cx, top + i * lineH, px, maxWidth, contrast, "top");
    });
    boxes.push({ layer: { kind: which }, x: cx - widest / 2, y: top, w: widest, h: blockH });
  }
  for (const e of t.emojis) {
    const px = Math.round(e.size * size);
    const p = clampPos(e);
    ctx.save();
    ctx.font = `${px}px ${EMOJI_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(e.char, p.x * size, p.y * size);
    ctx.restore();
    boxes.push({ layer: { kind: "emoji", id: e.id }, x: p.x * size - px / 2, y: p.y * size - px / 2, w: px, h: px });
  }
  return boxes;
}

/** Horizontal room the box style needs around the text (px at this scale). */
const px0 = (scale: number) => 28 * scale;

function drawLine(
  ctx: CanvasRenderingContext2D,
  t: MemeText,
  line: string,
  x: number,
  y: number,
  px: number,
  maxWidth: number,
  contrast: string,
  which: "top" | "bottom",
): void {
  ctx.save();
  switch (t.style) {
    case "outline":
      ctx.lineWidth = Math.max(3, px * 0.18);
      ctx.strokeStyle = contrast;
      ctx.strokeText(line, x, y, maxWidth);
      ctx.fillStyle = t.color;
      ctx.fillText(line, x, y, maxWidth);
      break;
    case "shadow":
      ctx.shadowColor = contrast === "#000000" ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.85)";
      ctx.shadowBlur = px * 0.12;
      ctx.shadowOffsetX = px * 0.06;
      ctx.shadowOffsetY = px * 0.08;
      ctx.fillStyle = t.color;
      ctx.fillText(line, x, y, maxWidth);
      break;
    case "box": {
      const w = Math.min(ctx.measureText(line).width, maxWidth) + px * 0.5;
      const h = px * 1.15;
      const top = which === "top" ? y - px * 0.08 : y - h + px * 0.08;
      ctx.fillStyle = contrast === "#000000" ? "rgba(0,0,0,0.82)" : "rgba(255,255,255,0.92)";
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(x - w / 2, top, w, h, px * 0.22);
      else ctx.rect(x - w / 2, top, w, h);
      ctx.fill();
      ctx.fillStyle = t.color;
      ctx.fillText(line, x, y, maxWidth);
      break;
    }
    case "neon":
      // Colored glow, near-white core: reads on dark and busy pictures.
      ctx.shadowColor = t.color;
      ctx.shadowBlur = px * 0.45;
      ctx.lineWidth = Math.max(2, px * 0.07);
      ctx.strokeStyle = t.color;
      ctx.strokeText(line, x, y, maxWidth);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(line, x, y, maxWidth);
      ctx.shadowBlur = px * 0.2;
      ctx.fillText(line, x, y, maxWidth);
      break;
  }
  ctx.restore();
}

/** Make sure the caption font is ready before drawing (else the canvas falls back silently). */
async function fontReady(t: MemeText): Promise<void> {
  const f = TEXT_FONTS[t.font];
  try {
    await loadTextFont(t.font);
    await document.fonts?.load(`${f.weight} 48px ${f.family}`, "AÁÑ");
  } catch {
    // best effort
  }
}

/** The overlay PNG for upload, or null when there's no text. */
export async function renderMemeText(t: MemeText, size = 512): Promise<Blob | null> {
  if (!hasLayers(t)) return null;
  await fontReady(t);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  drawMemeText(ctx, t, size);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}
