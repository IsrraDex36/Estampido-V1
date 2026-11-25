import type { CommunitySticker, PublishRequest } from "@contract";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CommunityFilters } from "../store/filters";
import { fetchSounds, fetchStats, fetchStickers, publishSticker, type SoundQuery } from "./api";

/** Query keys in one place (hierarchical: invalidating ["community"] refreshes all). */
export const communityKeys = {
  all: ["community"] as const,
  feed: (f: CommunityFilters) => ["community", "feed", f] as const,
  ranking: (period: string) => ["community", "ranking", period] as const,
  sounds: (p: SoundQuery) => ["community", "sounds", p] as const,
  stats: ["community", "stats"] as const,
};

/**
 * Feed with cursor pagination. Each filter combo has its own cache entry;
 * changing filters cancels the in-flight request (signal) and keeps the old
 * page on screen until the new one arrives (no layout jump).
 */
export function useStickerFeed(filters: CommunityFilters) {
  return useInfiniteQuery({
    queryKey: communityKeys.feed(filters),
    queryFn: ({ pageParam, signal }) => fetchStickers(filters, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
  });
}

export function useSoundFeed(params: SoundQuery, enabled = true) {
  return useInfiniteQuery({
    queryKey: communityKeys.sounds(params),
    queryFn: ({ pageParam, signal }) => fetchSounds(params, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Top 10 of the week. */
export function useRanking() {
  return useQuery({
    queryKey: communityKeys.ranking("week"),
    queryFn: ({ signal }) =>
      fetchStickers({ sort: "top", period: "week", category: null, query: "" }, null, signal, 10),
    select: (page) => page.items,
  });
}

export function useCommunityStats() {
  return useQuery({ queryKey: communityKeys.stats, queryFn: ({ signal }) => fetchStats(signal) });
}

export function usePublish() {
  const qc = useQueryClient();
  return useMutation<CommunitySticker, Error, PublishRequest>({
    mutationFn: publishSticker,
    onSuccess: () => qc.invalidateQueries({ queryKey: communityKeys.all }),
  });
}
