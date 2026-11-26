import { canonicalCommunitySearch } from "@/features/community/store/filters";
import { ROUTES, SOUND_PARAM } from "./routes";

/**
 * URL standardization (pure, tested). Whatever is typed or pasted in the
 * address bar, the app lands on one canonical URL:
 * - path: lowercase, no duplicate or trailing slashes, known aliases
 * - query: only the params that route understands, with valid values;
 *   unknown/invalid ones are dropped (never crash, never reach the API)
 * Unknown paths are left alone → the 404 page.
 */

/** Friendly aliases → canonical path. */
const ALIASES: Record<string, string> = {
  "/crear": ROUTES.create,
  "/inicio": ROUTES.create,
  "/index.html": ROUTES.create,
  "/community": ROUTES.community,
  "/comunidades": ROUTES.community,
  "/privacy": ROUTES.privacy,
  "/terminos": ROUTES.privacy,
};

const KNOWN = new Set<string>(Object.values(ROUTES));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_URL = 2048;

export const isKnownPath = (path: string): boolean => KNOWN.has(path);

export function canonicalPath(pathname: string): string {
  let p = (pathname || "/").slice(0, MAX_URL).toLowerCase().replace(/\/{2,}/g, "/");
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1) p = p.replace(/\/+$/, "") || "/";
  return ALIASES[p] ?? p;
}

/** Per-route allowed query, canonical form ("" or "?…"). */
export function canonicalSearch(path: string, search: string): { search: string; invalidSound: boolean } {
  const raw = search.slice(0, MAX_URL);
  if (path === ROUTES.community) return { search: canonicalCommunitySearch(raw), invalidSound: false };
  if (path === ROUTES.create) {
    const sound = new URLSearchParams(raw).get(SOUND_PARAM);
    if (sound === null) return { search: "", invalidSound: false };
    const valid = UUID_RE.test(sound.trim());
    return { search: valid ? `?${SOUND_PARAM}=${sound.trim().toLowerCase()}` : "", invalidSound: !valid };
  }
  return { search: "", invalidSound: false }; // 404 page: params mean nothing
}

export interface CanonicalUrl {
  path: string;
  search: string;
  href: string;
  /** The current URL differs from the canonical one. */
  changed: boolean;
  /** `?sonido=` was present but not a valid sound id. */
  invalidSound: boolean;
}

export function canonicalUrl(pathname: string, search: string): CanonicalUrl {
  const path = canonicalPath(pathname);
  const current = search && !search.startsWith("?") ? `?${search}` : search;
  const { search: s, invalidSound } = canonicalSearch(path, current);
  const href = `${path}${s}`;
  return { path, search: s, href, changed: href !== `${pathname}${current}`, invalidSound };
}
