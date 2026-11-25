import { create } from "zustand";
import type { CategoryId, FeedSort, TopPeriod } from "../model";
import { type CommunityFilters, DEFAULT_FILTERS } from "./filters";

interface CommunityState extends CommunityFilters {
  setSort: (sort: FeedSort) => void;
  setPeriod: (period: TopPeriod) => void;
  /** Same category again → clears it (chip toggle). */
  toggleCategory: (category: CategoryId | null) => void;
  setQuery: (query: string) => void;
  /** Replace all filters at once (URL → store). */
  hydrate: (filters: CommunityFilters) => void;
  reset: () => void;
}

/**
 * Community filters. Client UI state only — feed data will live in a query
 * cache (phase 2), not here. Read with atomic selectors:
 *   const sort = useCommunityStore((s) => s.sort)
 */
export const useCommunityStore = create<CommunityState>()((set) => ({
  ...DEFAULT_FILTERS,
  setSort: (sort) => set({ sort }),
  setPeriod: (period) => set({ period }),
  toggleCategory: (category) => set((s) => ({ category: s.category === category ? null : category })),
  setQuery: (query) => set({ query }),
  hydrate: (filters) => set(filters),
  reset: () => set(DEFAULT_FILTERS),
}));

export const selectFilters = (s: CommunityState): CommunityFilters => ({
  sort: s.sort,
  period: s.period,
  category: s.category,
  query: s.query,
});

export const selectHasFilters = (s: CommunityState): boolean =>
  s.sort !== DEFAULT_FILTERS.sort || s.category !== null || s.query.trim() !== "";
