import { useCallback, useEffect, useRef, useState } from "react";
import { usePreview } from "@/features/community/store/previewStore";

/**
 * Listen to one stretch of the chosen sound before converting. `position` is
 * the playhead (seconds) while playing, for the waveform. Never autoplays.
 */
export function useAudioPreview(file: File | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const frame = useRef(0);
  const stopAt = useRef(Number.POSITIVE_INFINITY);
  const [position, setPosition] = useState<number | null>(null);

  const stop = useCallback(() => {
    cancelAnimationFrame(frame.current);
    audioRef.current?.pause();
    setPosition(null);
  }, []);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.preload = "auto";
    audioRef.current = audio;
    return () => {
      cancelAnimationFrame(frame.current);
      audio.pause();
      audio.removeAttribute("src"); // abort any pending load before the URL dies
      audio.load();
      audioRef.current = null;
      URL.revokeObjectURL(url);
      setPosition(null);
    };
  }, [file]);

  const play = useCallback(
    (from: number, length: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      usePreview.getState().stop(); // one sound at a time
      cancelAnimationFrame(frame.current);
      audio.currentTime = from;
      stopAt.current = from + length;
      setPosition(from);
      const tick = () => {
        if (audio.paused || audio.ended || audio.currentTime >= stopAt.current) {
          stop();
          return;
        }
        setPosition(audio.currentTime);
        frame.current = requestAnimationFrame(tick);
      };
      audio
        .play()
        .then(() => {
          frame.current = requestAnimationFrame(tick);
        })
        .catch(() => setPosition(null));
    },
    [stop],
  );

  return { playing: position !== null, position, play, stop };
}
