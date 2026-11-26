import { useCallback, useEffect, useRef, useState } from "react";
import type { StickerMode } from "@/components/SyncedSticker";

export interface StickerPlayer {
  hasAudio: boolean;
  /** idle (loops on its own) · playing (picture follows the sound) · paused (both frozen). */
  status: StickerMode;
  playing: boolean;
  muted: boolean;
  /** 0–1 playback position. */
  progress: number;
  /** Seconds (0 until metadata loads). */
  duration: number;
  /** Start from the top, or resume if paused. */
  play: () => void;
  pause: () => void;
  /** Tap behaviour: playing → pause, otherwise play. */
  toggle: () => void;
  toggleMute: () => void;
  /** Sound position (s): the clock the sticker's frames follow. */
  getTime: () => number;
}

/**
 * Sound-sticker preview: one audio element is the clock; the sticker
 * (SyncedSticker) draws the frame for its time, so pause freezes both and
 * play continues both. Muting keeps the clock running (silently) so the
 * picture stays in sync. Mount with `key={stickerUrl}` so state resets.
 */
export function useStickerPlayer(audioUrl: string | null): StickerPlayer {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState<StickerMode>("idle");
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!audioUrl) return;
    const audio = new Audio(audioUrl);
    audio.preload = "auto";
    const onTime = () => setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    const onMeta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onPlay = () => setStatus("playing");
    const onPause = () => setStatus(audio.ended ? "idle" : "paused");
    const onEnded = () => {
      setStatus("idle");
      setProgress(0);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audioRef.current = null;
    };
  }, [audioUrl]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (status !== "paused") audio.currentTime = 0;
    void audio.play().catch(() => setStatus("idle"));
  }, [status]);

  const pause = useCallback(() => audioRef.current?.pause(), []);
  const toggle = useCallback(() => (status === "playing" ? pause() : play()), [status, pause, play]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    if (audioRef.current) audioRef.current.muted = next;
    setMuted(next);
  }, [muted]);

  const getTime = useCallback(() => audioRef.current?.currentTime ?? 0, []);

  return {
    hasAudio: Boolean(audioUrl),
    status,
    playing: status === "playing",
    muted,
    progress,
    duration,
    play,
    pause,
    toggle,
    toggleMute,
    getTime,
  };
}
