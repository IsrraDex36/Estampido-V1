import type { CreatorProfile } from "@contract";
import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { notify } from "@/lib/notify";
import { queryKeys } from "@/lib/query/keys";
import * as api from "./endpoints";

export const socialQueries = {
  following: () => queryOptions({ queryKey: queryKeys.social.following, queryFn: ({ signal }) => api.getFollowing(signal) }),
  feed: () =>
    infiniteQueryOptions({
      queryKey: queryKeys.social.feed,
      queryFn: ({ pageParam, signal }) => api.getFollowingFeed(pageParam, signal),
      initialPageParam: null as string | null,
      getNextPageParam: (last) => last.nextCursor,
    }),
  myPacks: (sticker?: string) =>
    queryOptions({ queryKey: queryKeys.social.myPacks(sticker), queryFn: ({ signal }) => api.getMyPacks(sticker, signal) }),
  pack: (id: string) =>
    queryOptions({ queryKey: queryKeys.social.pack(id), queryFn: ({ signal }) => api.getPack(id, signal), meta: { errorMessage: false } }),
  creatorPacks: (handle: string) =>
    queryOptions({ queryKey: queryKeys.social.creatorPacks(handle), queryFn: ({ signal }) => api.getCreatorPacks(handle, signal) }),
  tags: (category?: string | null) =>
    queryOptions({
      queryKey: queryKeys.social.tags(category),
      queryFn: ({ signal }) => api.getPopularTags(category, signal),
      staleTime: 5 * 60_000,
      meta: { errorMessage: false },
    }),
};

/** Follow / unfollow, optimistic on the creator's profile. */
export function useFollow(handle: string) {
  const qc = useQueryClient();
  const key = queryKeys.creators.profile(handle);
  return useMutation({
    mutationKey: ["social", "follow", handle],
    mutationFn: (on: boolean) => api.setFollow(handle, on),
    onMutate: (on) => {
      const prev = qc.getQueryData<CreatorProfile>(key);
      if (prev) {
        qc.setQueryData<CreatorProfile>(key, {
          ...prev,
          followedByMe: on,
          followers: Math.max(0, prev.followers + (on ? 1 : -1) * (prev.followedByMe === on ? 0 : 1)),
        });
      }
      return { prev };
    },
    onError: (_e, _on, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSuccess: (r) => {
      const cur = qc.getQueryData<CreatorProfile>(key);
      if (cur) qc.setQueryData<CreatorProfile>(key, { ...cur, followedByMe: r.following, followers: r.followers });
      void qc.invalidateQueries({ queryKey: queryKeys.social.following });
      void qc.invalidateQueries({ queryKey: queryKeys.social.feed });
      void qc.invalidateQueries({ queryKey: queryKeys.creators.top });
      notify.success(r.following ? `Ahora sigues a @${handle}` : `Dejaste de seguir a @${handle}`);
    },
  });
}

/** Any pack change: refresh every pack view. */
export function useInvalidatePacks() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.social.all });
}
