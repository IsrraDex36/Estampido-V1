import { create } from "zustand";

/**
 * Preview video playhead/length. Updated ~4×/s while playing, so it lives in
 * its own store: only the controls that show it re-render.
 */
interface PlaybackState {
  currentTime?: number;
  duration?: number;
  setCurrentTime: (sec: number) => void;
  setDuration: (sec: number | undefined) => void;
  reset: () => void;
}

export const usePlaybackStore = create<PlaybackState>()((set) => ({
  currentTime: undefined,
  duration: undefined,
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  reset: () => set({ currentTime: undefined, duration: undefined }),
}));
