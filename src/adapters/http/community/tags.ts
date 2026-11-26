import { COMMUNITY_LIMITS, COMMUNITY_TAG_RE } from "../contract.js";
import { normalize } from "./feed.js";

/** Words that never make a useful tag. */
const STOP = new Set(
  "el la los las un una unos unas de del al y o que en con por para mi tu su es se lo le me te ya no si pero mas muy cuando como esto eso este esta jaja jajaja xd the and you".split(
    " ",
  ),
);

/** Candidate tags from a title: real words, 3–20 chars, lowercase, no accents. Pure. */
export function wordsAsTags(title: string): string[] {
  const out: string[] = [];
  for (const raw of normalize(title).split(/[^\p{L}\p{N}_-]+/u)) {
    const w = raw.replace(/^[-_]+|[-_]+$/g, "");
    if (w.length < 3 || w.length > COMMUNITY_LIMITS.maxTagLength || STOP.has(w) || /^\d+$/.test(w)) continue;
    if (!COMMUNITY_TAG_RE.test(w) || out.includes(w)) continue;
    out.push(w);
  }
  return out;
}

/**
 * Tag suggestions for a new sticker: words from its title first (most
 * specific), then what's popular in its category, then popular overall.
 * Unique, valid, at most `max`. Pure.
 */
export function suggestTags(
  title: string,
  inCategory: readonly string[],
  overall: readonly string[],
  max = 8,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [...wordsAsTags(title).slice(0, 4), ...inCategory, ...overall]) {
    const tag = normalize(t);
    if (!tag || seen.has(tag) || !COMMUNITY_TAG_RE.test(tag) || tag.length > COMMUNITY_LIMITS.maxTagLength) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}
