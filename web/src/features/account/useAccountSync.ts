import type { FavoriteKind } from "@contract";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLink } from "@/features/bot/api";
import { useFavorites } from "@/features/community/store/favoritesStore";
import { queryKeys } from "@/lib/query/keys";
import { useMe } from "./api";
import { getFavoriteSounds, getFavoriteStickers, importFavorites } from "./endpoints";

const importedKey = (userId: string) => `estampido-fav-imported:${userId}`;
const flag = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k) === "1";
    } catch {
      return false;
    }
  },
  set: (k: string) => {
    try {
      localStorage.setItem(k, "1");
    } catch {
      // private mode: we'll just import again next time (idempotent)
    }
  },
};

/**
 * Keeps the account in step with the app (mounted once, in the shell):
 * - the moment this browser gets linked to a WhatsApp, sign in;
 * - once signed in, merge what was saved on this device into the account
 *   (one time per account and device) and mirror the account's favorites.
 */
export function useAccountSync() {
  const qc = useQueryClient();
  const linkState = useLink().data?.state;
  const me = useMe().data;
  const userId = me?.id ?? null;

  useEffect(() => {
    if (linkState === "linked" && me === null) void qc.invalidateQueries({ queryKey: queryKeys.account.me });
  }, [linkState, me, qc]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      if (!flag.get(importedKey(userId))) {
        const st = useFavorites.getState();
        const items: { id: string; kind: FavoriteKind }[] = [
          ...Object.keys(st.stickers).map((id) => ({ id, kind: "sticker" as const })),
          ...Object.keys(st.sounds).map((id) => ({ id, kind: "sound" as const })),
        ];
        if (items.length > 0) await importFavorites(items);
        flag.set(importedKey(userId));
      }
      const [stickers, sounds] = await Promise.all([getFavoriteStickers(), getFavoriteSounds()]);
      if (!cancelled) useFavorites.getState().replaceSaved(stickers, sounds);
    })().catch(() => {
      // offline / server busy: keep the device copy, try again next sign-in
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);
}
