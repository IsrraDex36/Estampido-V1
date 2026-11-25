import { COMMUNITY_CATEGORIES, type CommunityCategory, type CommunityPeriod, type CommunitySort } from "../contract.js";

/** What the ranking needs from a stored sticker. */
export interface Rankable {
  id: string;
  title: string;
  category: CommunityCategory;
  tags: string[];
  createdAt: number;
  uses: number;
}

export interface FeedQuery {
  sort: CommunitySort;
  period: CommunityPeriod;
  category?: CommunityCategory | null;
  q?: string;
  limit: number;
  cursor?: string | null;
}

interface Cursor {
  /** Ranking moment of the first page: keeps time-based scores and the item set stable. */
  asOf: number;
  /** Last item of the previous page. */
  score: number;
  id: string;
}

const HOUR = 3_600_000;
const PERIOD_MS: Record<CommunityPeriod, number> = {
  day: 24 * HOUR,
  week: 7 * 24 * HOUR,
  all: Number.POSITIVE_INFINITY,
};

/**
 * Score for an ordering (higher first). Pure and deterministic for a given asOf.
 * - new: recency
 * - top: uses (period applied as a filter)
 * - hot: log-uses with time decay (a fresh sticker can beat an old popular one)
 */
export function scoreOf(item: Rankable, sort: CommunitySort, asOf: number): number {
  if (sort === "new") return item.createdAt;
  if (sort === "top") return item.uses;
  const ageHours = Math.max(0, (asOf - item.createdAt) / HOUR);
  return Math.log10(1 + item.uses) - ageHours / 36;
}

/** Lowercase, no accents: "Cumpleaños" ~ "cumpleanos". */
export const normalize = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const LABEL = new Map<string, string>(COMMUNITY_CATEGORIES.map((c) => [c.id, normalize(c.label)]));

export function matches(item: Rankable, category: CommunityCategory | null | undefined, q: string): boolean {
  if (category && item.category !== category) return false;
  if (!q) return true;
  const hay = normalize([item.title, ...item.tags, LABEL.get(item.category) ?? ""].join(" "));
  return normalize(q)
    .split(/\s+/)
    .every((word) => hay.includes(word));
}

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

/** Malformed/tampered cursor → null (caller answers 400). */
export function decodeCursor(raw: string): Cursor | null {
  try {
    const c = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<Cursor>;
    if (typeof c.asOf !== "number" || typeof c.score !== "number" || typeof c.id !== "string") return null;
    if (!Number.isFinite(c.asOf) || c.id.length > 64) return null;
    return { asOf: c.asOf, score: c.score, id: c.id };
  } catch {
    return null;
  }
}

/** (score desc, id desc): a total order, so keyset pagination never skips or repeats. */
const before = (a: { score: number; id: string }, b: { score: number; id: string }) =>
  a.score !== b.score ? a.score > b.score : a.id > b.id;

/**
 * Filter → rank → one page after the cursor. Items created after the first
 * page's `asOf` are excluded until a fresh (cursor-less) request, so pages
 * never shift while scrolling.
 */
export function pageOf<T extends Rankable>(
  all: readonly T[],
  query: FeedQuery,
  now = Date.now(),
): { items: T[]; nextCursor: string | null } | { error: "bad_cursor" } {
  let cursor: Cursor | null = null;
  if (query.cursor) {
    cursor = decodeCursor(query.cursor);
    if (!cursor) return { error: "bad_cursor" };
  }
  const asOf = cursor?.asOf ?? now;
  const minCreated = query.sort === "top" ? asOf - PERIOD_MS[query.period] : Number.NEGATIVE_INFINITY;
  const q = (query.q ?? "").slice(0, 80);

  const ranked = all
    .filter((it) => it.createdAt <= asOf && it.createdAt >= minCreated && matches(it, query.category, q))
    .map((it) => ({ it, score: scoreOf(it, query.sort, asOf), id: it.id }))
    .sort((a, b) => (before(a, b) ? -1 : 1));

  const start = cursor ? ranked.findIndex((r) => before(cursor, r)) : 0;
  const from = start === -1 ? ranked.length : start;
  const page = ranked.slice(from, from + query.limit);
  const last = page.at(-1);
  const more = from + query.limit < ranked.length;
  return {
    items: page.map((r) => r.it),
    nextCursor: more && last ? encodeCursor({ asOf, score: last.score, id: last.id }) : null,
  };
}
