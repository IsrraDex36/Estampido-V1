import { create } from "zustand";
import { ApiError, convertVideo } from "@/lib/api";
import { DEFAULT_OPTIONS, defaultDurationFor } from "../model/defaults";
import { EMPTY_TEXT, hasLayers, type MemeText, renderMemeText } from "../model/memeText";
import { resetFor } from "../model/resetTab";
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
  /** The audio is a community sound (remix): shown in the UI and linked when publishing. */
  communitySound: CommunitySoundRef | null;
  /** communitySound at the moment the current result was made. */
  resultSoundOrigin: string | null;
  options: ConverterOptions;
  /** Open settings tab (the result can jump straight to one). */
  settingsTab: SettingsTabId;
  setSettingsTab: (tab: SettingsTabId) => void;
  /** What the current result was made with (shown on the result, not the live options). */
  resultApplied: ResultApplied | null;
  /** Meme text drawn over the sticker (rendered to a PNG at convert time). */
  text: MemeText;
  status: ConverterStatus;

  /** Returns a user-facing error, or null. */
  selectFile: (file: File | null) => string | null;
  selectAudioFile: (file: File | null, origin?: CommunitySoundRef) => string | null;
  updateOptions: (patch: Partial<ConverterOptions>) => void;
  updateText: (patch: Partial<MemeText>) => void;
  /** Back to defaults for one settings tab (only that tab's choices). */
  resetTab: (tab: SettingsTabId) => void;
  convert: (opts?: { auto?: boolean }) => Promise<void>;
  /** Conversions started (keys the error card so each failure starts fresh). */
  attempt: number;
  /** Automatic retries after «busy» in a row (reset on success or a new file). */
  autoRetries: number;
  cancel: () => void;
}

export type SettingsTabId = "time" | "sound" | "style" | "text" | "pack";

export interface ResultApplied {
  text: boolean;
  voice?: ConverterOptions["voice"];
  look?: ConverterOptions["look"];
  flip: boolean;
}

export interface CommunitySoundRef {
  id: string;
  title: string;
}

// Not state: an imperative handle for the in-flight request.
let inflight: AbortController | null = null;

export const useConverterStore = create<ConverterState>()((set, get) => ({
  file: null,
  previewUrl: null,
  inputKind: null,
  audioFile: null,
  communitySound: null,
  resultSoundOrigin: null,
  options: DEFAULT_OPTIONS,
  text: EMPTY_TEXT,
  settingsTab: "time",
  setSettingsTab: (settingsTab) => set({ settingsTab }),
  resultApplied: null,
  status: { kind: "idle" },

  selectFile: (file) => {
    inflight?.abort();
    if (file) {
      const error = validateFile(file);
      if (error) {
        set({ status: { kind: "error", error: { message: error, code: "invalid_file", status: 0 } } });
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
      options: {
        ...s.options,
        startSec: 0,
        durationSec: defaultDurationFor(kind, s.options.durationSec),
        cropX: undefined,
        cropY: undefined,
        cropZoom: undefined,
      },
    }));
    return null;
  },

  selectAudioFile: (audioFile, origin) => {
    if (audioFile) {
      const error = validateAudioFile(audioFile);
      if (error) return error;
    }
    set((s) => ({
      audioFile,
      communitySound: audioFile && origin ? origin : null,
      options: { ...s.options, audioStartSec: 0, audioDurationSec: undefined, ...(audioFile ? { includeAudio: true } : {}) },
    }));
    return null;
  },

  updateOptions: (patch) => set((s) => ({ options: { ...s.options, ...patch } })),
  updateText: (patch) => set((s) => ({ text: { ...s.text, ...patch } })),
  resetTab: (tab) =>
    set((s) => {
      const r = resetFor(tab, s.inputKind);
      return {
        options: { ...s.options, ...r.options },
        ...(r.text ? { text: r.text } : {}),
        ...(r.clearAudio ? { audioFile: null, communitySound: null } : {}),
      };
    }),

  attempt: 0,
  autoRetries: 0,

  convert: async ({ auto = false } = {}) => {
    const { file, audioFile, options, communitySound, text } = get();
    if (!file) return;
    set((s) => ({ attempt: s.attempt + 1, autoRetries: auto ? s.autoRetries + 1 : 0 }));
    inflight?.abort();
    const controller = new AbortController();
    inflight = controller;
    set({ status: { kind: "uploading", progress: 0 } });
    try {
      // Only draw when there's text (no extra tick otherwise); a cancel meanwhile stops here.
      const overlay = hasLayers(text) ? await renderMemeText(text).catch(() => null) : null;
      if (controller.signal.aborted) return;
      const result = await convertVideo({ media: file, audio: audioFile, overlay }, options, {
        signal: controller.signal,
        onUploadProgress: (progress) => set({ status: { kind: "uploading", progress } }),
        onQueued: (position, etaSec) => set({ status: { kind: "queued", position, etaSec } }),
        onProcessing: (elapsedSec, expectedSec) => set({ status: { kind: "processing", elapsedSec, expectedSec } }),
      });
      if (controller.signal.aborted) return; // cancelled meanwhile: ignore late results
      set({
        status: { kind: "done", result },
        resultApplied: {
          text: overlay !== null,
          voice: options.includeAudio && result.audio ? options.voice : undefined,
          look: options.look,
          flip: options.flip === true,
        },
        resultSoundOrigin: audioFile ? (communitySound?.id ?? null) : null,
        autoRetries: 0,
      });
    } catch (err) {
      // Cancelled (or superseded): never let a late failure overwrite the state.
      if (controller.signal.aborted || (err instanceof ApiError && err.code === "aborted")) return;
      set({
        status: {
          kind: "error",
          error:
            err instanceof ApiError
              ? { message: err.message, code: err.code, status: err.status, retryAfterSec: err.retryAfterSec }
              : { message: err instanceof Error ? err.message : "Error desconocido.", code: "internal", status: 0 },
        },
      });
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
export const selectBusy = (s: ConverterState) =>
  s.status.kind === "uploading" || s.status.kind === "queued" || s.status.kind === "processing";
export const selectResult = (s: ConverterState) => (s.status.kind === "done" ? s.status.result : null);
