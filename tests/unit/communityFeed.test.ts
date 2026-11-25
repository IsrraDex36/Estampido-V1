import { describe, expect, it } from "vitest";
import {
  decodeCursor,
  encodeCursor,
  type FeedQuery,
  matches,
  pageOf,
  type Rankable,
  scoreOf,
} from "../../src/adapters/http/community/feed.js";

const H = 3_600_000;
const NOW = Date.UTC(2026, 10, 25, 12);
const CATS = ["memes", "musica", "anime"] as const;

/** 57 items, varied ages/uses; deterministic. Ids sortable but unrelated to order. */
const items: Rankable[] = Array.from({ length: 57 }, (_, i) => ({
  id: `id-${String((i * 37) % 101).padStart(3, "0")}`,
  title: i % 5 === 0 ? `Gato cumpleaños ${i}` : `Sticker ${i}`,
  category: CATS[i % 3],
  tags: i % 4 === 0 ? ["risa"] : [],
  createdAt: NOW - i * 5 * H,
  uses: (i * 13) % 9, // lots of ties → id tiebreak matters
}));

function walk(all: Rankable[], q: Omit<FeedQuery, "cursor">, now = NOW) {
  const seen: string[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 100; guard++) {
    const r = pageOf(all, { ...q, cursor }, now);
    if ("error" in r) throw new Error("bad cursor");
    seen.push(...r.items.map((i) => i.id));
    if (!r.nextCursor) return seen;
    cursor = r.nextCursor;
  }
  throw new Error("pagination did not end");
}

describe("community feed pagination", () => {
  for (const sort of ["hot", "new", "top"] as const) {
    it(`${sort}: pages of 10 cover everything once, in the same order as one big page`, () => {
      const q = { sort, period: "all" as const, limit: 10 };
      const paged = walk(items, q);
      const single = pageOf(items, { ...q, limit: 1000 }, NOW);
      if ("error" in single) throw new Error();
      expect(new Set(paged).size).toBe(paged.length);
      expect(paged).toEqual(single.items.map((i) => i.id));
    });
  }

  it("stable while scrolling: new posts and time passing don't shift later pages", () => {
    const first = pageOf(items, { sort: "hot", period: "all", limit: 10 }, NOW);
    if ("error" in first || !first.nextCursor) throw new Error();
    const later = [
      ...items,
      { id: "zzz-new", title: "Nuevo", category: "memes" as const, tags: [], createdAt: NOW + H, uses: 99 },
    ];
    const second = pageOf(later, { sort: "hot", period: "all", limit: 10, cursor: first.nextCursor }, NOW + 5 * H);
    const reference = pageOf(items, { sort: "hot", period: "all", limit: 20 }, NOW);
    if ("error" in second || "error" in reference) throw new Error();
    expect(second.items.map((i) => i.id)).toEqual(reference.items.slice(10).map((i) => i.id));
    expect(second.items.some((i) => i.id === "zzz-new")).toBe(false);
  });

  it("top + period filters by age; category and accent-insensitive search", () => {
    const day = walk(items, { sort: "top", period: "day", limit: 7 });
    expect(day.length).toBe(5); // ages 0,5,10,15,20 h
    const anime = walk(items, { sort: "new", period: "all", category: "anime", limit: 4 });
    expect(anime.length).toBe(19);
    const search = walk(items, { sort: "new", period: "all", q: "CUMPLEANOS gato", limit: 3 });
    expect(search.length).toBe(12);
    expect(matches(items[4] as Rankable, null, "risa")).toBe(true); // tag
    expect(matches(items[1] as Rankable, null, "musica")).toBe(true); // category label
  });

  it("hot: a fresh sticker beats an old popular one", () => {
    const fresh = { id: "a", title: "", category: "memes" as const, tags: [], createdAt: NOW - H, uses: 1 };
    const old = { id: "b", title: "", category: "memes" as const, tags: [], createdAt: NOW - 10 * 24 * H, uses: 500 };
    expect(scoreOf(fresh, "hot", NOW)).toBeGreaterThan(scoreOf(old, "hot", NOW));
  });

  it("rejects tampered cursors; ends with nextCursor null", () => {
    expect(pageOf(items, { sort: "new", period: "all", limit: 5, cursor: "nope" }, NOW)).toEqual({
      error: "bad_cursor",
    });
    expect(decodeCursor(encodeCursor({ asOf: 1, score: 2, id: "x" }))).toEqual({ asOf: 1, score: 2, id: "x" });
    expect(decodeCursor(Buffer.from('{"asOf":"x"}').toString("base64url"))).toBeNull();
    const all = pageOf(items, { sort: "new", period: "all", limit: 100 }, NOW);
    expect("error" in all ? null : all.nextCursor).toBeNull();
  });
});
