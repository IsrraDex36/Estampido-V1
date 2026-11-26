import type { CommunitySound, CommunitySticker } from "@contract";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const MAX_SAVED = 200;

interface FavoritesState {
  /** Saved stickers / sounds and what this device published: snapshots so they render instantly. */
  stickers: Record<string, CommunitySticker>;
  sounds: Record<string, CommunitySound>;
  published: Record<string, CommunitySticker>;
  toggleSticker: (s: CommunitySticker) => void;
  toggleSound: (s: CommunitySound) => void;
  addPublished: (s: CommunitySticker) => void;
  /** A sticker that no longer exists (its owner deleted it): drop every local copy. */
  forgetSticker: (id: string) => void;
  /** Signed in: the account's saved lists replace the device ones. */
  replaceSaved: (stickers: CommunitySticker[], sounds: CommunitySound[]) => void;
  /** Signed out: nothing of the account stays on a shared device. */
  clearAll: () => void;
}

/** Newest-first insert with a cap (oldest dropped). Pure. */
export function withItem<T>(map: Record<string, T>, id: string, item: T, cap = MAX_SAVED): Record<string, T> {
  const entries = [[id, item] as const, ...Object.entries(map).filter(([k]) => k !== id)].slice(0, cap);
  return Object.fromEntries(entries);
}

export function withoutItem<T>(map: Record<string, T>, id: string): Record<string, T> {
  const { [id]: _removed, ...rest } = map;
  return rest;
}

const storage = createJSONStorage(() => {
  try {
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
  }
});

/**
 * Favorites as snapshots (render instantly, work offline). Signed out they
 * live on this device; signed in they mirror the account (see
 * features/account/useAccountSync). Read with atomic selectors, e.g.
 * useFavorites((s) => id in s.stickers).
 */
export const useFavorites = create<FavoritesState>()(
  persist(
    (set) => ({
      stickers: {},
      sounds: {},
      published: {},
      toggleSticker: (s) =>
        set((st) => ({ stickers: s.id in st.stickers ? withoutItem(st.stickers, s.id) : withItem(st.stickers, s.id, s) })),
      toggleSound: (s) =>
        set((st) => ({ sounds: s.id in st.sounds ? withoutItem(st.sounds, s.id) : withItem(st.sounds, s.id, s) })),
      addPublished: (s) => set((st) => ({ published: withItem(st.published, s.id, s) })),
      forgetSticker: (id) =>
        set((st) => {
          const { [id]: _saved, ...stickers } = st.stickers;
          const { [id]: _pub, ...published } = st.published;
          return { stickers, published };
        }),
      replaceSaved: (stickers, sounds) =>
        set({
          stickers: Object.fromEntries(stickers.slice(0, MAX_SAVED).map((s) => [s.id, s])),
          sounds: Object.fromEntries(sounds.slice(0, MAX_SAVED).map((s) => [s.id, s])),
        }),
      clearAll: () => set({ stickers: {}, sounds: {}, published: {} }),
    }),
    {
      name: "estampido-favorites",
      version: 1,
      storage,
      partialize: (s) => ({ stickers: s.stickers, sounds: s.sounds, published: s.published }),
    },
  ),
);
