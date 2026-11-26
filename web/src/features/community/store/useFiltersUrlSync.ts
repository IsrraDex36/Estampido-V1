import { useEffect } from "react";
import { useSearch } from "wouter";
import { selectFilters, useCommunityStore } from "./communityStore";
import { FILTER_KEYS, parseFilters, serializeFilters } from "./filters";

/**
 * Two-way sync between the URL (?orden=top&cat=memes&q=…) and the store, so a
 * filtered view can be shared or reloaded. URL wins on load / back-forward;
 * store changes replace the URL (no history spam while typing).
 */
export function useFiltersUrlSync(): void {
  const search = useSearch();

  useEffect(() => {
    const fromUrl = parseFilters(search);
    if (serializeFilters(fromUrl) !== serializeFilters(selectFilters(useCommunityStore.getState()))) {
      useCommunityStore.getState().hydrate(fromUrl);
    }
  }, [search]);

  useEffect(
    () =>
      useCommunityStore.subscribe((state, prev) => {
        const next = serializeFilters(selectFilters(state));
        if (next === serializeFilters(selectFilters(prev))) return;
        // Keep params that aren't filters (e.g. ?tab=…).
        const merged = new URLSearchParams(window.location.search);
        for (const k of FILTER_KEYS) merged.delete(k);
        for (const [k, v] of new URLSearchParams(next)) merged.set(k, v);
        const s = merged.toString();
        const url = `${window.location.pathname}${s ? `?${s}` : ""}`;
        if (url !== `${window.location.pathname}${window.location.search}`) {
          window.history.replaceState(window.history.state, "", url);
        }
      }),
    [],
  );
}
