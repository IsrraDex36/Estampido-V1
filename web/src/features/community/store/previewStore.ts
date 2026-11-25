import { create } from "zustand";

interface PreviewState {
  /** URL of the sound playing right now (only one at a time). */
  playing: string | null;
  toggle: (url: string) => void;
  stop: () => void;
}

// Imperative handle, not state: a single <audio> for every card/row.
let audio: HTMLAudioElement | null = null;

/** One shared preview player: starting a sound stops the previous one. Never autoplays. */
export const usePreview = create<PreviewState>()((set, get) => ({
  playing: null,
  toggle: (url) => {
    if (get().playing === url) {
      get().stop();
      return;
    }
    audio?.pause();
    audio = new Audio(url);
    audio.onended = () => set({ playing: null });
    audio.onerror = () => set({ playing: null });
    set({ playing: url });
    void audio.play().catch(() => set({ playing: null }));
  },
  stop: () => {
    audio?.pause();
    audio = null;
    set({ playing: null });
  },
}));
