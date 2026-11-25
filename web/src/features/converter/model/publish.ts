import { COMMUNITY_LIMITS } from "@contract";

/** Split "risa, gato  perro" → ["risa","gato","perro"] (max 3, trimmed, deduped). Pure. */
export function parseTags(raw: string): string[] {
  const tags = raw
    .split(/[,\s#]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(tags)].slice(0, COMMUNITY_LIMITS.maxTags);
}
