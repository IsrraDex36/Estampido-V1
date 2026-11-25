import type { ConvertResponse } from "@contract";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface CollectionItem {
  id: string;
  stickerUrl: string;
  audioUrl: string | null;
  animated: boolean;
  /** Sound length (s), when it has sound. */
  soundSec?: number;
  createdAt: number;
  /** Server deletes the files after this (ms epoch). */
  expiresAt: number;
}

export const MAX_ITEMS = 30;

/** Result → collection item. Pure. */
export function toItem(r: ConvertResponse, now = Date.now()): CollectionItem {
  return {
    id: r.id,
    stickerUrl: r.sticker.url,
    audioUrl: r.audio?.url ?? null,
    animated: r.sticker.animated,
    soundSec: r.audio?.durationSec,
    createdAt: now,
    expiresAt: Date.parse(r.expiresAt),
  };
}

interface CollectionState {
  items: CollectionItem[];
  /** Selected ids, in collection order. */
  selected: string[];
  add: (item: CollectionItem) => void;
  toggle: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  remove: (ids: string[]) => void;
  /** Drop items whose files the server already deleted. */
  prune: (now?: number) => void;
}

/**
 * Stickers made this session. Persisted to sessionStorage (survives reloads,
 * not closing the tab) — the server keeps files for 30 min anyway.
 */
export const useCollectionStore = create<CollectionState>()(
  persist(
    (set) => ({
      items: [],
      selected: [],
      add: (item) =>
        set((s) => {
          if (s.items.some((i) => i.id === item.id)) return s;
          const items = [item, ...s.items].slice(0, MAX_ITEMS);
          // new stickers start selected: the common case is "send what I just made"
          return { items, selected: [item.id, ...s.selected].filter((id) => items.some((i) => i.id === id)) };
        }),
      toggle: (id) =>
        set((s) => ({ selected: s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id] })),
      selectAll: () => set((s) => ({ selected: s.items.map((i) => i.id) })),
      clearSelection: () => set({ selected: [] }),
      remove: (ids) =>
        set((s) => ({
          items: s.items.filter((i) => !ids.includes(i.id)),
          selected: s.selected.filter((id) => !ids.includes(id)),
        })),
      prune: (now = Date.now()) =>
        set((s) => {
          const items = s.items.filter((i) => i.expiresAt > now);
          if (items.length === s.items.length) return s;
          return { items, selected: s.selected.filter((id) => items.some((i) => i.id === id)) };
        }),
    }),
    {
      name: "estampido-collection",
      storage: createJSONStorage(() => {
        try {
          return sessionStorage;
        } catch {
          // storage blocked (private mode): in-memory only
          const mem = new Map<string, string>();
          return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
        }
      }),
      partialize: (s) => ({ items: s.items, selected: s.selected }),
    },
  ),
);

/** Selected items in display order. */
export const selectSelectedItems = (s: CollectionState) => s.items.filter((i) => s.selected.includes(i.id));
