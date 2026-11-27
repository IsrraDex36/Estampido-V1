import { unlinkSelf } from "@/features/self/endpoints";
import type { CommunitySound, CommunitySticker, FavoriteKind, Me, MeUpdate, WhatsAppLink } from "@contract";
import {
  infiniteQueryOptions,
  queryOptions,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { useFavorites } from "@/features/community/store/favoritesStore";
import { ApiError } from "@/lib/api";
import { notify } from "@/lib/notify";
import { queryKeys } from "@/lib/query/keys";
import {
  createSession,
  deleteAccount,
  deleteMySticker,
  getCreator,
  getCreatorStickers,
  getMe,
  getMyStickers,
  getTopCreators,
  logout,
  setFavorite,
  updateMe,
} from "./endpoints";

/**
 * The signed-in user (null = signed out). Signing in is automatic: if the
 * cookie session is missing but this browser IS linked to a WhatsApp, the
 * query opens a session for it. Re-runs only when invalidated (link changes,
 * sign-out), never on focus: anonymous visitors cost one request.
 */
export const meOptions = (qc: QueryClient) =>
  queryOptions({
    queryKey: queryKeys.account.me,
    queryFn: async ({ signal }): Promise<Me | null> => {
      const me = await getMe(signal);
      if (me) return me;
      const link = qc.getQueryData<WhatsAppLink>(queryKeys.bot.link);
      if (link?.state !== "linked") return null;
      try {
        return (await createSession()).me;
      } catch (err) {
        // Blocked account: say so. Bot offline / outdated: stay signed out quietly, the app still works.
        if (err instanceof ApiError && err.code === "account_banned") notify.error(err.message, { id: "account_banned" });
        return null;
      }
    },
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    retry: false,
    meta: { errorMessage: false },
  });

/** `undefined` while the first check runs. */
export function useMe() {
  const qc = useQueryClient();
  return useQuery(meOptions(qc));
}

export function useLogout() {
  const qc = useQueryClient();
  const clearAll = useFavorites((s) => s.clearAll);
  return useMutation({
    mutationKey: ["account", "logout"],
    // Sign out = also remove this device from your WhatsApp (else it would sign right back in).
    mutationFn: async () => {
      await logout();
      await unlinkSelf();
    },
    onSuccess: () => {
      qc.setQueryData(queryKeys.account.me, null);
      qc.setQueryData(queryKeys.bot.link, { state: "unlinked" } satisfies WhatsAppLink);
      qc.removeQueries({ queryKey: queryKeys.account.stickers });
      clearAll();
      notify.success("Sesión cerrada en este navegador.");
    },
  });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation<Me, Error, MeUpdate>({
    mutationKey: ["account", "update"],
    mutationFn: updateMe,
    meta: { errorMessage: false }, // the form shows the message
    onSuccess: (me) => {
      qc.setQueryData(queryKeys.account.me, me);
      // My name/handle/avatar appear on my stickers and creator page.
      void qc.invalidateQueries({ queryKey: queryKeys.community.all });
      void qc.invalidateQueries({ queryKey: queryKeys.creators.all });
      void qc.invalidateQueries({ queryKey: queryKeys.account.stickers });
    },
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  const clearAll = useFavorites((s) => s.clearAll);
  return useMutation({
    mutationKey: ["account", "delete"],
    mutationFn: deleteAccount,
    onSuccess: ({ removed }) => {
      qc.setQueryData(queryKeys.account.me, null);
      qc.setQueryData(queryKeys.bot.link, { state: "unlinked" } satisfies WhatsAppLink);
      void qc.invalidateQueries({ queryKey: queryKeys.community.all });
      void qc.invalidateQueries({ queryKey: queryKeys.creators.all });
      clearAll();
      notify.success(removed ? `Cuenta borrada junto con ${removed} sticker(s).` : "Cuenta borrada.");
    },
  });
}

export const myStickersOptions = () =>
  infiniteQueryOptions({
    queryKey: queryKeys.account.stickers,
    queryFn: ({ pageParam, signal }) => getMyStickers(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

export function useMyStickers(enabled: boolean) {
  return useInfiniteQuery({ ...myStickersOptions(), enabled });
}

export function useDeleteMySticker() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationKey: ["account", "sticker", "delete"],
    mutationFn: deleteMySticker,
    meta: { successMessage: "Sticker borrado." },
    onSuccess: (_r, id) => useFavorites.getState().forgetSticker(id),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.account.all });
      void qc.invalidateQueries({ queryKey: queryKeys.community.all });
      void qc.invalidateQueries({ queryKey: queryKeys.creators.all });
    },
  });
}

/**
 * Save / unsave. Instant on screen (local snapshot); signed in, it's also
 * saved to the account — if that fails the change is undone.
 */
export function useToggleFavorite() {
  const qc = useQueryClient();
  const toggleSticker = useFavorites((s) => s.toggleSticker);
  const toggleSound = useFavorites((s) => s.toggleSound);
  return useCallback(
    (kind: FavoriteKind, item: CommunitySticker | CommunitySound) => {
      const st = useFavorites.getState();
      const wasSaved = kind === "sticker" ? item.id in st.stickers : item.id in st.sounds;
      const flip = () =>
        kind === "sticker" ? toggleSticker(item as CommunitySticker) : toggleSound(item as CommunitySound);
      flip();
      if (!qc.getQueryData<Me | null>(queryKeys.account.me)) return;
      setFavorite(kind, item.id, !wasSaved).catch((err) => {
        flip();
        notify.error(err instanceof ApiError ? err : null, { fallback: "No se pudo guardar." });
      });
    },
    [qc, toggleSticker, toggleSound],
  );
}

// ── creators ────────────────────────────────────────────────────────────
export const creatorQueries = {
  top: (limit = 6) =>
    queryOptions({
      queryKey: [...queryKeys.creators.top, limit] as const,
      queryFn: ({ signal }) => getTopCreators(signal, limit),
      staleTime: 60_000,
    }),
  profile: (handle: string) =>
    queryOptions({
      queryKey: queryKeys.creators.profile(handle),
      queryFn: ({ signal }) => getCreator(handle, signal),
      retry: (n, err) => !(err instanceof ApiError && err.status === 404) && n < 2,
      meta: { errorMessage: false },
    }),
  stickers: (handle: string) =>
    infiniteQueryOptions({
      queryKey: queryKeys.creators.stickers(handle),
      queryFn: ({ pageParam, signal }) => getCreatorStickers(handle, pageParam, signal),
      initialPageParam: null as string | null,
      getNextPageParam: (last) => last.nextCursor,
    }),
};
