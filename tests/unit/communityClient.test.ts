import { describe, expect, it } from "vitest";
import {
  MAX_SAVED,
  useFavorites,
  withItem,
  withoutItem,
} from "../../web/src/features/community/store/favoritesStore.js";
import { parseTags } from "../../web/src/features/converter/model/publish.js";

describe("publish tags", () => {
  it("splits on commas/spaces/#, lowercases, dedupes, caps at 3", () => {
    expect(parseTags("Risa, gato  #Risa perro loro")).toEqual(["risa", "gato", "perro"]);
    expect(parseTags("   ")).toEqual([]);
  });
});

describe("favorites helpers", () => {
  it("newest first, re-saving moves to front, capped", () => {
    let m: Record<string, number> = {};
    m = withItem(m, "a", 1);
    m = withItem(m, "b", 2);
    m = withItem(m, "a", 3);
    expect(Object.entries(m)).toEqual([
      ["a", 3],
      ["b", 2],
    ]);
    expect(withoutItem(m, "a")).toEqual({ b: 2 });
    let big: Record<string, number> = {};
    for (let i = 0; i < MAX_SAVED + 5; i++) big = withItem(big, `k${i}`, i);
    expect(Object.keys(big)).toHaveLength(MAX_SAVED);
    expect(Object.keys(big)[0]).toBe(`k${MAX_SAVED + 4}`);
  });
});

describe("deleting your sticker", () => {
  it("forgetSticker drops it from saved and published, leaves the rest", () => {
    const st = (id: string) => ({ id, title: id }) as never;
    useFavorites.setState({ stickers: { a: st("a"), b: st("b") }, published: { a: st("a"), c: st("c") } });
    useFavorites.getState().forgetSticker("a");
    expect(Object.keys(useFavorites.getState().stickers)).toEqual(["b"]);
    expect(Object.keys(useFavorites.getState().published)).toEqual(["c"]);
    useFavorites.getState().forgetSticker("zzz"); // unknown: no-op
    expect(Object.keys(useFavorites.getState().stickers)).toEqual(["b"]);
  });
});
