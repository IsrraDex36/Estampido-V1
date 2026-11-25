import { useEffect, useState } from "react";
import { computePeaks } from "../model/audioWindow";

export type PeaksState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; duration: number; peaks: number[] }
  | { kind: "error" };

type Decoded = { file: File; result: { duration: number; peaks: number[] } | null };

/** Decodes the chosen sound once and returns its waveform (or "error" if the browser can't). */
export function useAudioPeaks(file: File | null, bars: number): PeaksState {
  const [decoded, setDecoded] = useState<Decoded | null>(null);
  const supported = typeof AudioContext !== "undefined";

  useEffect(() => {
    if (!file || !supported) return;
    let alive = true;
    const ctx = new AudioContext();
    file
      .arrayBuffer()
      .then((buf) => ctx.decodeAudioData(buf))
      .then((audio) => {
        const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
        if (alive) setDecoded({ file, result: { duration: audio.duration, peaks: computePeaks(channels, bars) } });
      })
      .catch(() => {
        if (alive) setDecoded({ file, result: null });
      })
      .finally(() => void ctx.close().catch(() => {}));
    return () => {
      alive = false;
    };
  }, [file, bars, supported]);

  if (!file) return { kind: "idle" };
  if (!supported) return { kind: "error" };
  if (decoded?.file !== file) return { kind: "loading" };
  return decoded.result ? { kind: "ready", ...decoded.result } : { kind: "error" };
}
