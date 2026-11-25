import { create } from "zustand";
import { ApiError, convertVideo } from "@/lib/api";
import { DEFAULT_OPTIONS, defaultDurationFor } from "../model/defaults";
import { validateAudioFile, validateFile } from "../model/validation";
import { type ConverterOptions, type ConverterStatus, type InputKind, inputKindOf } from "../types";

/**
 * Converter state. Components subscribe to the slices they render (selectors),
 * so e.g. editing the pack name doesn't re-render the preview. High-frequency
 * playback state lives in playbackStore.
 */
export interface ConverterState {
  file: File | null;
  previewUrl: string | null;
  inputKind: InputKind | null;
  audioFile: File | null;
  options: ConverterOptions;
  status: ConverterStatus;

  /** Returns a user-facing error, or null. */
  selectFile: (file: File | null) => string | null;
  selectAudioFile: (file: File | null) => string | null;
  updateOptions: (patch: Partial<ConverterOptions>) => void;
  convert: () => Promise<void>;
  cancel: () => void;
}

// Not state: an imperative handle for the in-flight request.
let inflight: AbortController | null = null;

export const useConverterStore = create<ConverterState>()((set, get) => ({
  file: null,
  previewUrl: null,
  inputKind: null,
  audioFile: null,
  options: DEFAULT_OPTIONS,
  status: { kind: "idle" },

  selectFile: (file) => {
    inflight?.abort();
    if (file) {
      const error = validateFile(file);
      if (error) {
        set({ status: { kind: "error", message: error } });
        return error;
      }
    }
    const previous = get().previewUrl;
    if (previous) URL.revokeObjectURL(previous); // free the old preview
    if (!file) {
      set({ file: null, previewUrl: null, inputKind: null, status: { kind: "idle" } });
      return null;
    }
    const kind = inputKindOf(file);
    set((s) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      inputKind: kind,
      status: { kind: "ready" },
      options: { ...s.options, startSec: 0, durationSec: defaultDurationFor(kind, s.options.durationSec) },
    }));
    return null;
  },

  selectAudioFile: (audioFile) => {
    if (audioFile) {
      const error = validateAudioFile(audioFile);
      if (error) return error;
    }
    set((s) => ({ audioFile, options: { ...s.options, audioStartSec: 0 } }));
    return null;
  },

  updateOptions: (patch) => set((s) => ({ options: { ...s.options, ...patch } })),

  convert: async () => {
    const { file, audioFile, options } = get();
    if (!file) return;
    inflight?.abort();
    const controller = new AbortController();
    inflight = controller;
    set({ status: { kind: "uploading", progress: 0 } });
    try {
      const result = await convertVideo({ media: file, audio: audioFile }, options, {
        signal: controller.signal,
        onUploadProgress: (progress) => set({ status: { kind: "uploading", progress } }),
        onProcessing: () => set({ status: { kind: "processing" } }),
      });
      if (controller.signal.aborted) return; // cancelled meanwhile: ignore late results
      set({ status: { kind: "done", result } });
    } catch (err) {
      // Cancelled (or superseded): never let a late failure overwrite the state.
      if (controller.signal.aborted || (err instanceof ApiError && err.code === "aborted")) return;
      set({ status: { kind: "error", message: err instanceof Error ? err.message : "Error desconocido." } });
    } finally {
      if (inflight === controller) inflight = null;
    }
  },

  cancel: () => {
    inflight?.abort();
    set((s) => ({ status: { kind: s.file ? "ready" : "idle" } }));
  },
}));

/** Derived selectors (keep components free of status-shape logic). */
export const selectBusy = (s: ConverterState) => s.status.kind === "uploading" || s.status.kind === "processing";
export const selectResult = (s: ConverterState) => (s.status.kind === "done" ? s.status.result : null);
