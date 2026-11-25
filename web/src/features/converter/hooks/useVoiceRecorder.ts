import { useCallback, useEffect, useRef, useState } from "react";
import { micErrorMessage, pickRecordingType, recordingFileName } from "../model/recording";

export type RecorderState =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "recording"; elapsed: number; level: number }
  | { kind: "error"; message: string };

/**
 * Microphone → audio File (MediaRecorder). Ephemeral UI state, so it lives
 * in the component (not in a store); only the final File goes to the store.
 * Live level via an AnalyserNode; auto-stops at `maxSec`. Everything is
 * released on stop/cancel/unmount.
 */
export function useVoiceRecorder({ maxSec, onDone }: { maxSec: number; onDone: (file: File) => void }) {
  const [state, setState] = useState<RecorderState>({ kind: "idle" });
  const session = useRef<{
    recorder: MediaRecorder;
    stream: MediaStream;
    audio: AudioContext;
    raf: number;
    startedAt: number;
    discard: boolean;
  } | null>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const release = useCallback(() => {
    const s = session.current;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    for (const t of s.stream.getTracks()) t.stop();
    void s.audio.close().catch(() => {});
    session.current = null;
  }, []);

  const stop = useCallback((discard = false) => {
    const s = session.current;
    if (!s) return;
    s.discard = discard;
    if (s.recorder.state !== "inactive") s.recorder.stop();
  }, []);

  const start = useCallback(async () => {
    if (session.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setState({ kind: "error", message: "Tu navegador no permite grabar audio." });
      return;
    }
    setState({ kind: "requesting" });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      setState({ kind: "error", message: micErrorMessage(err) });
      return;
    }
    const mimeType = pickRecordingType((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 96_000 } : undefined);
    const chunks: Blob[] = [];
    const audio = new AudioContext();
    const analyser = audio.createAnalyser();
    analyser.fftSize = 512;
    audio.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);

    const s = { recorder, stream, audio, raf: 0, startedAt: performance.now(), discard: false };
    session.current = s;

    const tick = () => {
      const elapsed = (performance.now() - s.startedAt) / 1000;
      analyser.getByteTimeDomainData(samples);
      let peak = 0;
      for (const v of samples) peak = Math.max(peak, Math.abs(v - 128) / 128);
      setState({ kind: "recording", elapsed, level: Math.min(1, peak * 1.6) });
      if (elapsed >= maxSec) stop();
      else s.raf = requestAnimationFrame(tick);
    };

    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const seconds = (performance.now() - s.startedAt) / 1000;
      const type = recorder.mimeType || mimeType || "audio/webm";
      release();
      setState({ kind: "idle" });
      if (s.discard || seconds < 0.3 || chunks.length === 0) return;
      onDoneRef.current(new File(chunks, recordingFileName(seconds, type), { type: type.split(";")[0] }));
    };
    recorder.start(250);
    s.raf = requestAnimationFrame(tick);
  }, [maxSec, release, stop]);

  // Unmount (e.g. tab change) → never leave the mic on.
  useEffect(
    () => () => {
      const s = session.current;
      if (s) {
        s.discard = true;
        if (s.recorder.state !== "inactive") s.recorder.stop();
      }
      release();
    },
    [release],
  );

  return { state, start, stop: () => stop(false), cancel: () => stop(true), reset: () => setState({ kind: "idle" }) };
}
