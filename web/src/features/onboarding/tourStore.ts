import { create } from "zustand";

const SEEN_KEY = "estampido-tour-v1";

function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true; // storage blocked: don't nag on every visit
  }
}

interface TourState {
  open: boolean;
  show: () => void;
  close: () => void;
}

/** Welcome tour: opens by itself once per browser; «¿Cómo funciona?» reopens it. */
export const useTourStore = create<TourState>()((set) => ({
  open: !readSeen(),
  show: () => set({ open: true }),
  close: () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // per-visit only
    }
    set({ open: false });
  },
}));
