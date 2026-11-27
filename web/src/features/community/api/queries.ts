import { infiniteQueryOptions, keepPreviousData, queryOptions, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import type { CommunityFilters } from "../store/filters";
import { fetchSound, fetchSounds, fetchStats, fetchStickers, fetchTrending, type SoundQuery } from "./endpoints";

/**
 * Reusable query definitions (TanStack `queryOptions` / `infiniteQueryOptions`):
 * the same object feeds useQuery, prefetchQuery, getQueryData and
 * invalidateQueries, with types inferred end-to-end.
 */
export const communityQueries = {
  /** Cursor-paginated feed; one cache entry per filter combination. */
  feed: (filters: CommunityFilters) =>
    infiniteQueryOptions({
      queryKey: queryKeys.community.feed(filters),
      queryFn: ({ pageParam, signal }) => fetchStickers(filters, pageParam, signal),
      initialPageParam: null as string | null,
      getNextPageParam: (last) => last.nextCursor,
    }),

  sounds: (params: SoundQuery) =>
    infiniteQueryOptions({
      queryKey: queryKeys.community.sounds(params),
      queryFn: ({ pageParam, signal }) => fetchSounds(params, pageParam, signal),
      initialPageParam: null as string | null,
      getNextPageParam: (last) => last.nextCursor,
    }),

  sound: (id: string) =>
    queryOptions({
      queryKey: queryKeys.community.sound(id),
      queryFn: ({ signal }) => fetchSound(id, signal),
      staleTime: 60_000,
    }),

  /** Top 10 of the week. */
  ranking: () =>
    queryOptions({
      queryKey: queryKeys.community.ranking("week"),
      queryFn: ({ signal }) => fetchStickers({ sort: "top", period: "week", category: null, query: "" }, null, signal, 10),
      select: (page) => page.items,
    }),

  /** Grouped trends (cached 30 s on the server too). */
  trending: () =>
    queryOptions({ queryKey: queryKeys.community.trending, queryFn: ({ signal }) => fetchTrending(signal), staleTime: 30_000 }),

  stats: () => queryOptions({ queryKey: queryKeys.community.stats, queryFn: ({ signal }) => fetchStats(signal) }),
};

/**
 * Feed hook. Changing filters aborts the in-flight request (signal) and keeps
 * the previous pages on screen until the new ones arrive (no layout jump).
 */
export function useStickerFeed(filters: CommunityFilters, enabled = true) {
  return useInfiniteQuery({ ...communityQueries.feed(filters), placeholderData: keepPreviousData, enabled });
}

export function useSoundFeed(params: SoundQuery) {
  return useInfiniteQuery({ ...communityQueries.sounds(params), placeholderData: keepPreviousData });
}

export const useRanking = () => useQuery(communityQueries.ranking());
export const useCommunityStats = () => useQuery(communityQueries.stats());
