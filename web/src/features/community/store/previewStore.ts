import { create } from "zustand";

interface PreviewState {
  /** URL of the sound playing right now (only one at a time). */
  playing: string | null;
  /** URL of the sound paused mid-way (resumes where it stopped). */
  paused: string | null;
  /** Same sound → pause/resume; another sound → stop the current one and start it. */
  toggle: (url: string) => void;
  stop: () => void;
}

// Imperative handle, not state: a single <audio> for every card/row.
let audio: HTMLAudioElement | null = null;
let audioUrl: string | null = null;

/** Position (s) of the shared preview — the clock synced stickers follow. */
export const previewTime = (url: string): number => (audio && audioUrl === url ? audio.currentTime : 0);

/** One shared preview player: starting a sound stops the previous one. Never autoplays. */
export const usePreview = create<PreviewState>()((set, get) => ({
  playing: null,
  paused: null,
  toggle: (url) => {
    const { playing, paused } = get();
    if (audio && audioUrl === url && playing === url) {
      audio.pause();
      set({ playing: null, paused: url });
      return;
    }
    if (audio && audioUrl === url && paused === url) {
      set({ playing: url, paused: null });
      void audio.play().catch(() => set({ playing: null, paused: null }));
      return;
    }
    audio?.pause();
    const next = new Audio(url);
    audio = next;
    audioUrl = url;
    next.onended = () => {
      if (audio === next) set({ playing: null, paused: null });
    };
    next.onerror = () => {
      if (audio === next) set({ playing: null, paused: null });
    };
    set({ playing: url, paused: null });
    void next.play().catch(() => {
      if (audio === next) set({ playing: null, paused: null });
    });
  },
  stop: () => {
    audio?.pause();
    audio = null;
    audioUrl = null;
    set({ playing: null, paused: null });
  },
}));

/** idle / playing / paused for one sound url (for SyncedSticker). */
export const usePreviewMode = (url: string | null): "idle" | "playing" | "paused" =>
  usePreview((s) => (url !== null && s.playing === url ? "playing" : url !== null && s.paused === url ? "paused" : "idle"));
