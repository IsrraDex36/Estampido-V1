import { CATEGORIES, type CategoryId, FEED_SORTS, type FeedSort, TOP_PERIODS, type TopPeriod } from "../model";

export interface CommunityFilters {
  sort: FeedSort;
  period: TopPeriod;
  category: CategoryId | null;
  query: string;
}

export const DEFAULT_FILTERS: CommunityFilters = { sort: "hot", period: "week", category: null, query: "" };

const MAX_QUERY = 80;
/** URL params owned by the filters (others, like ?tab, are left alone). */
export const FILTER_KEYS = ["orden", "periodo", "cat", "q"] as const;
const oneOf = <T extends string>(list: readonly { id: T }[], v: string | null): T | undefined =>
  list.find((x) => x.id === v)?.id;

/** URL query → filters. Unknown/invalid values fall back to defaults. Pure. */
export function parseFilters(search: string): CommunityFilters {
  const q = new URLSearchParams(search);
  return {
    sort: oneOf(FEED_SORTS, q.get("orden")) ?? DEFAULT_FILTERS.sort,
    period: oneOf(TOP_PERIODS, q.get("periodo")) ?? DEFAULT_FILTERS.period,
    category: oneOf(CATEGORIES, q.get("cat")) ?? null,
    query: (q.get("q") ?? "").slice(0, MAX_QUERY),
  };
}

/** Filters → URL query (only non-defaults; period only matters for Top). Pure. */
export function serializeFilters(f: CommunityFilters): string {
  const q = new URLSearchParams();
  if (f.sort !== DEFAULT_FILTERS.sort) q.set("orden", f.sort);
  if (f.sort === "top" && f.period !== DEFAULT_FILTERS.period) q.set("periodo", f.period);
  if (f.category) q.set("cat", f.category);
  const query = f.query.trim();
  if (query) q.set("q", query.slice(0, MAX_QUERY));
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Community tabs (?tab=…; «stickers» is the default and never written). */
export const COMMUNITY_TABS = ["stickers", "sonidos", "creadores", "espacio"] as const;
export type CommunityTab = (typeof COMMUNITY_TABS)[number];

/** ?tab=… → tab (unknown → stickers). Pure. */
export const parseTab = (search: string): CommunityTab => {
  const t = new URLSearchParams(search).get("tab");
  return (COMMUNITY_TABS as readonly string[]).includes(t ?? "") ? (t as CommunityTab) : "stickers";
};

/** The community page's canonical query: filters + tab (only non-defaults). Pure. */
export function canonicalCommunitySearch(search: string): string {
  const q = new URLSearchParams(serializeFilters(parseFilters(search)));
  const tab = parseTab(search);
  if (tab !== "stickers") q.set("tab", tab);
  const s = q.toString();
  return s ? `?${s}` : "";
}
