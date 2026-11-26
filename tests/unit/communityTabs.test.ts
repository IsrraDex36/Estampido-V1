import { describe, expect, it } from "vitest";
import { canonicalSearch } from "../../web/src/app/url.js";
import {
  canonicalCommunitySearch,
  parseFilters,
  parseTab,
  serializeFilters,
} from "../../web/src/features/community/store/filters.js";
import { compactNumber, countLabel, exactNumber } from "../../web/src/lib/format.js";

/** Intl separates «370 k» with a no-break space (so it never wraps); compare with plain spaces. */
const plain = (s: string) => s.replace(/\u00a0/g, " ");

describe("compact numbers never break a card", () => {
  it.each([
    [0, "0"],
    [7, "7"],
    [999, "999"],
    [1_000, "1 k"],
    [9_876, "9.9 k"],
    [123_456, "123 k"],
    [370_368, "370 k"],
    [1_234_567, "1.2 M"],
    [9_999_999_999, "10 mil M"],
  ])("%d → %s", (n, out) => expect(plain(compactNumber(n))).toBe(out));

  it("bad input is 0; labels pluralize; exact numbers for tooltips", () => {
    for (const bad of [-5, Number.NaN, Number.POSITIVE_INFINITY, undefined, null])
      expect(compactNumber(bad as never)).toBe("0");
    expect(countLabel(1, "uso", "usos")).toBe("1 uso");
    expect(countLabel(2, "uso", "usos")).toBe("2 usos");
    expect(plain(countLabel(123_456, "uso", "usos"))).toBe("123 k usos");
    expect(compactNumber(370_368)).toContain("\u00a0"); // number and unit never split
    expect(exactNumber(370_368)).toBe("370,368");
    for (const n of [5, 12_345, 987_654_321]) expect(compactNumber(n).length).toBeLessThanOrEqual(7);
  });
});

describe("community tab in the URL", () => {
  it("parses known tabs, falls back to stickers", () => {
    expect(parseTab("?tab=sonidos")).toBe("sonidos");
    expect(parseTab("?tab=creadores&orden=top")).toBe("creadores");
    expect(parseTab("?tab=espacio")).toBe("espacio");
    expect(parseTab("?tab=hack<script>")).toBe("stickers");
    expect(parseTab("")).toBe("stickers");
  });

  it("canonical community URL keeps filters + a valid tab, drops junk", () => {
    expect(canonicalCommunitySearch("?tab=sonidos")).toBe("?tab=sonidos");
    expect(canonicalCommunitySearch("?tab=stickers")).toBe("");
    expect(canonicalCommunitySearch("?tab=nope&x=1")).toBe("");
    expect(canonicalCommunitySearch("?orden=top&tab=creadores&utm=1")).toBe("?orden=top&tab=creadores");
    // The app-wide canonicalizer uses it (regression: it used to drop ?tab).
    expect(canonicalSearch("/comunidad", "?tab=sonidos").search).toBe("?tab=sonidos");
  });

  it("filters still round-trip alone (tab is not a filter)", () => {
    const f = parseFilters("?orden=top&cat=memes&tab=sonidos");
    expect(serializeFilters(f)).toBe("?orden=top&cat=memes");
  });
});
