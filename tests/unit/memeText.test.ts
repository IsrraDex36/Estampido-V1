import { describe, expect, it } from "vitest";
import {
  cleanCaption,
  EMPTY_TEXT,
  fitCaption,
  hasText,
  MAX_LINES,
  MAX_TEXT_CHARS,
  outlineFor,
  renderMemeText,
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
