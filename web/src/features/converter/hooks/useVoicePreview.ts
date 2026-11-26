import type { VoiceEffect } from "@contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { decodeAudio, playEffect, previewWindow } from "../model/voicePreview";
import { useConverterStore } from "../store/converterStore";

export type PreviewState = "idle" | "loading" | "playing" | "error";

/** Play the current sound window with a voice effect, in the browser. */
export function useVoicePreview() {
  const s = useConverterStore(
    useShallow((st) => ({
      file: st.file,
      audioFile: st.audioFile,
      kind: st.inputKind,
      startSec: st.options.startSec,
      durationSec: st.options.durationSec,
      audioStartSec: st.options.audioStartSec,
      audioDurationSec: st.options.audioDurationSec,
    })),
  );
  // The state belongs to the sound it was started for: change the sound and it reads «idle».
  const [raw, setRaw] = useState<{ state: PreviewState; source: Blob | null }>({ state: "idle", source: null });
  const ctxRef = useRef<AudioContext | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const win = previewWindow({ ...s, hasAudioFile: Boolean(s.audioFile) });
  const source = win?.from === "audio" ? s.audioFile : s.file;
  const state: PreviewState = raw.source === source ? raw.state : "idle";
  const setState = useCallback(
    (next: PreviewState | ((prev: PreviewState) => PreviewState)) =>
      setRaw((prev) => ({ source, state: typeof next === "function" ? next(prev.state) : next })),
    [source],
  );

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setState((v) => (v === "playing" || v === "loading" ? "idle" : v));
  }, [setState]);

  const play = useCallback(
    async (effect: VoiceEffect | undefined) => {
      stopRef.current?.();
      stopRef.current = null;
      if (!win || !source) return;
      setState("loading");
      try {
        ctxRef.current ??= new AudioContext();
        const ctx = ctxRef.current;
        if (ctx.state === "suspended") await ctx.resume();
        const buf = await decodeAudio(ctx, source);
        stopRef.current = playEffect(ctx, buf, win, effect, () => {
          stopRef.current = null;
          setState("idle");
        });
        setState("playing");
      } catch {
        setState("error");
      }
    },
    [win, source, setState],
  );

  // A new sound (or leaving the tab) silences the old one; the state already reads «idle».
  useEffect(() => {
    void source;
    return () => {
      stopRef.current?.();
      stopRef.current = null;
    };
  }, [source]);
  useEffect(
    () => () => {
      void ctxRef.current?.close().catch(() => {});
    },
    [],
  );

  return { available: win !== null, state, play, stop };
}
