import { describe, expect, it } from "vitest";
import { MAX_SAVED, withItem, withoutItem } from "../../web/src/features/community/store/favoritesStore.js";
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
