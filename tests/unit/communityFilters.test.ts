import { beforeEach, describe, expect, it } from "vitest";
import { selectHasFilters, useCommunityStore } from "../../web/src/features/community/store/communityStore.js";
import { DEFAULT_FILTERS, parseFilters, serializeFilters } from "../../web/src/features/community/store/filters.js";

describe("community filters ⇄ URL", () => {
  it("defaults serialize to an empty query and parse back", () => {
    expect(serializeFilters(DEFAULT_FILTERS)).toBe("");
    expect(parseFilters("")).toEqual(DEFAULT_FILTERS);
  });

  it("round-trips non-default filters", () => {
    const f = { sort: "top", period: "day", category: "memes", query: "gato" } as const;
    const url = serializeFilters(f);
    expect(url).toBe("?orden=top&periodo=day&cat=memes&q=gato");
    expect(parseFilters(url)).toEqual(f);
  });

  it("period only travels with Top; query is trimmed", () => {
    expect(serializeFilters({ ...DEFAULT_FILTERS, sort: "new", period: "day", query: "  hola " })).toBe(
      "?orden=new&q=hola",
    );
  });

  it("invalid values fall back to defaults; long queries are capped", () => {
    const f = parseFilters(`?orden=hack&periodo=x&cat=<script>&q=${"a".repeat(200)}`);
    expect(f).toMatchObject({ sort: "hot", period: "week", category: null });
    expect(f.query).toHaveLength(80);
  });
});

describe("community store", () => {
  beforeEach(() => useCommunityStore.getState().reset());

  it("category chip toggles; reset clears everything", () => {
    const s = useCommunityStore.getState();
    s.toggleCategory("memes");
    expect(useCommunityStore.getState().category).toBe("memes");
    s.toggleCategory("memes");
    expect(useCommunityStore.getState().category).toBeNull();
    s.setSort("top");
    s.setQuery("x");
    expect(selectHasFilters(useCommunityStore.getState())).toBe(true);
    s.reset();
    expect(selectHasFilters(useCommunityStore.getState())).toBe(false);
  });

  it("hydrate replaces all filters (URL → store)", () => {
    useCommunityStore.getState().hydrate(parseFilters("?orden=top&periodo=all&cat=anime"));
    expect(useCommunityStore.getState()).toMatchObject({ sort: "top", period: "all", category: "anime", query: "" });
  });
});
