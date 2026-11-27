import type { FavoriteKind } from "@contract";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { signInWithSelf } from "@/features/self/endpoints";
import { useSelfStore } from "@/features/self/selfStore";
import { ApiError } from "@/lib/api";
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
  const session = useSelfStore((s) => s.session);
  const me = useMe().data;
  const userId = me?.id ?? null;
  const tried = useRef<string | null>(null);

  // Linked WhatsApp but signed out (cookie expired, other tab signed out…): sign in
  // again from the sealed session — once per session, no WhatsApp connection.
  useEffect(() => {
    if (!session || me !== null || tried.current === session) return;
    tried.current = session;
    signInWithSelf()
      .then((m) => qc.setQueryData(queryKeys.account.me, m))
      .catch((err) => {
        // The session no longer opens here (old format, expired, other browser): forget it.
        if (err instanceof ApiError && [400, 410].includes(err.status)) useSelfStore.getState().setSession(null);
      });
  }, [session, me, qc]);

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
