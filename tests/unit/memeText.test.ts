import { describe, expect, it } from "vitest";
import {
  clampPos,
  cleanCaption,
  drawMemeText,
  EMPTY_TEXT,
  fitCaption,
  hasLayers,
  hasText,
  isHexColor,
  layerAt,
  luminance,
  MAX_LINES,
  MAX_TEXT_CHARS,
  type MemeText,
  outlineFor,
  renderMemeText,
  TEXT_FONTS,
  TEXT_STYLES,
  wrapLines,
} from "../../web/src/features/converter/model/memeText.js";

// Monospace stand-in: each char is `px * 0.6` wide.
const measureAt = (px: number) => (s: string) => s.length * px * 0.6;
const mono = measureAt(10); // 6 px per char

describe("meme text layout", () => {
  it("cleans captions: control chars, spaces, cap length, MAYÚSCULAS with accents", () => {
    expect(cleanCaption("  hola\n\tmundo  ", false)).toBe("hola mundo");
    expect(cleanCaption("año épico", true)).toBe("AÑO ÉPICO");
    expect(cleanCaption("x".repeat(200), false)).toHaveLength(MAX_TEXT_CHARS);
    expect(cleanCaption("a\u0000b\u0007c", false)).toBe("abc");
  });

  it("hasText ignores blanks", () => {
    expect(hasText(EMPTY_TEXT)).toBe(false);
    expect(hasText({ ...EMPTY_TEXT, top: "   " })).toBe(false);
    expect(hasText({ ...EMPTY_TEXT, bottom: "ok" })).toBe(true);
  });

  it("wraps by words without exceeding the width", () => {
    const lines = wrapLines("cuando dices que es la ultima", 60, mono); // 10 chars per line
    expect(lines).toEqual(["cuando", "dices que", "es la", "ultima"]);
    for (const l of lines) expect(mono(l)).toBeLessThanOrEqual(60);
  });

  it("splits words longer than a line by characters", () => {
    const lines = wrapLines("supercalifragilistico ok", 60, mono);
    expect(lines.join("").replace(/ /g, "")).toBe("supercalifragilisticook");
    expect(lines[0]).toBe("supercalif");
    for (const l of lines) expect(mono(l)).toBeLessThanOrEqual(60);
  });

  it("shrinks the font until it fits in 3 lines; never below the minimum", () => {
    const short = fitCaption("HOLA", 60, 480, measureAt);
    expect(short).toEqual({ px: 60, lines: ["HOLA"] });
    const long = fitCaption("ESTE TEXTO ES BASTANTE LARGO PARA UN STICKER DE WHATSAPP", 80, 480, measureAt);
    expect(long.px).toBeLessThan(80);
    expect(long.lines.length).toBeLessThanOrEqual(MAX_LINES);
    const huge = fitCaption("A ".repeat(200).trim(), 80, 100, measureAt);
    expect(huge.px).toBe(22);
    expect(huge.lines).toHaveLength(MAX_LINES);
  });

  it("outline contrasts with the fill", () => {
    expect(outlineFor("#ffffff")).toBe("#000000");
    expect(outlineFor("#ffd23f")).toBe("#000000");
    expect(outlineFor("#000000")).toBe("#ffffff");
  });

  it("no text → no overlay (nothing uploaded)", async () => {
    expect(await renderMemeText(EMPTY_TEXT)).toBeNull();
  });
});

describe("free colors, fonts and styles", () => {
  it("any #rrggbb is a valid color; junk is not", () => {
    expect(isHexColor("#12aBef")).toBe(true);
    for (const bad of ["#fff", "red", "#12345g", "12abef", "#12abef0"]) expect(isHexColor(bad), bad).toBe(false);
  });

  it("outline follows luminance for any custom color", () => {
    expect(luminance("#ffffff")).toBeCloseTo(1, 3);
    expect(luminance("#000000")).toBe(0);
    expect(outlineFor("#1a1a40")).toBe("#ffffff"); // dark navy → light outline
    expect(outlineFor("#7fffd4")).toBe("#000000"); // aquamarine → dark outline
    expect(outlineFor("nope")).toBe("#000000");
  });

  it("8 typefaces with a family fallback, 4 styles", () => {
    expect(Object.keys(TEXT_FONTS)).toHaveLength(8);
    for (const f of Object.values(TEXT_FONTS)) expect(f.family).toMatch(/,/);
    expect(Object.keys(TEXT_STYLES)).toEqual(["outline", "shadow", "box", "neon"]);
    expect(EMPTY_TEXT.style).toBe("outline");
  });
});

/** Minimal 2D context: widths = chars × px × 0.6; records filled text. */
function fakeCtx() {
  const drawn: { text: string; x: number; y: number }[] = [];
  const ctx = {
    font: "",
    textAlign: "",
    textBaseline: "",
    lineJoin: "",
    miterLimit: 0,
    lineWidth: 0,
    strokeStyle: "",
    fillStyle: "",
    shadowColor: "",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    clearRect() {},
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    roundRect() {},
    fill() {},
    strokeText() {},
    fillText(text: string, x: number, y: number) {
      drawn.push({ text, x, y });
    },
    measureText(s: string) {
      const px = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10);
      return { width: [...s].length * px * 0.6 };
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, drawn };
}

describe("free layout: drag captions and emojis", () => {
  const t = (patch: Partial<MemeText>): MemeText => ({ ...EMPTY_TEXT, ...patch });

  it("classic: top caption at the top, bottom at the bottom, centered", () => {
    const { ctx } = fakeCtx();
    const boxes = drawMemeText(ctx, t({ top: "hola", bottom: "adios" }), 512);
    const [top, bottom] = boxes;
    expect(top?.layer).toEqual({ kind: "top" });
    expect(top?.y).toBe(16);
    expect((bottom?.y ?? 0) + (bottom?.h ?? 0)).toBeCloseTo(512 - 16, 5);
    expect((top?.x ?? 0) + (top?.w ?? 0) / 2).toBeCloseTo(256, 5);
  });

  it("dragged caption is centered on its position and kept inside the canvas", () => {
    const { ctx } = fakeCtx();
    const [mid] = drawMemeText(ctx, t({ top: "hola", topPos: { x: 0.5, y: 0.5 } }), 512);
    expect((mid?.y ?? 0) + (mid?.h ?? 0) / 2).toBeCloseTo(256, 5);
    const [edge] = drawMemeText(ctx, t({ top: "hola", topPos: { x: 1, y: 1 } }), 512);
    expect((edge?.x ?? 0) + (edge?.w ?? 0)).toBeLessThanOrEqual(512 - 16 + 0.001);
    expect((edge?.y ?? 0) + (edge?.h ?? 0)).toBeLessThanOrEqual(512 - 16 + 0.001);
  });

  it("emojis are drawn at their spot with their size, after the text (on top)", () => {
    const { ctx, drawn } = fakeCtx();
    const boxes = drawMemeText(
      ctx,
      t({ top: "x", emojis: [{ id: "e1", char: "🔥", x: 0.25, y: 0.75, size: 0.2 }] }),
      512,
    );
    const e = boxes.at(-1);
    expect(e?.layer).toEqual({ kind: "emoji", id: "e1" });
    expect(e?.w).toBe(Math.round(0.2 * 512));
    expect(drawn.at(-1)).toEqual({ text: "🔥", x: 128, y: 384 });
  });

  it("grabbing: the emoji on top wins; a little slop for fingers; empty space → nothing", () => {
    const { ctx } = fakeCtx();
    const boxes = drawMemeText(
      ctx,
      t({
        top: "un texto largo",
        topPos: { x: 0.5, y: 0.5 },
        emojis: [{ id: "e", char: "😂", x: 0.5, y: 0.5, size: 0.1 }],
      }),
      512,
    );
    expect(layerAt(boxes, 256, 256)?.layer).toEqual({ kind: "emoji", id: "e" });
    expect(layerAt(boxes, 256 - 50, 256)?.layer).toEqual({ kind: "top" });
    expect(layerAt(boxes, 5, 5)).toBeNull();
    const emoji = boxes.at(-1);
    expect(layerAt(boxes, (emoji?.x ?? 0) - 10, 256 - 40, 12)?.layer).toBeTruthy();
  });

  it("emojis alone count as something to upload; positions are clamped", () => {
    expect(hasLayers(t({ emojis: [{ id: "a", char: "👀", x: 0.5, y: 0.5, size: 0.2 }] }))).toBe(true);
    expect(hasLayers(EMPTY_TEXT)).toBe(false);
    expect(clampPos({ x: -0.3, y: 1.7 })).toEqual({ x: 0, y: 1 });
  });
});
