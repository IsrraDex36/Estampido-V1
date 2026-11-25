import { useCallback, useEffect, useRef, useState } from "react";

export interface StickerPlayer {
  /** Image src; changes on play to restart the animated WebP. */
  imageSrc: string;
  hasAudio: boolean;
  playing: boolean;
  muted: boolean;
  /** 0–1 playback position. */
  progress: number;
  /** Seconds (0 until metadata loads). */
  duration: number;
  play: () => void;
  pause: () => void;
  toggleMute: () => void;
}

/**
 * Sound-sticker preview behaviour (tap → restart animation + play the sound
 * once). Side effects live in callbacks/effects, never inside state updaters.
 * Mount with `key={stickerUrl}` so state resets per result.
 */
export function useStickerPlayer(stickerUrl: string, audioUrl: string | null): StickerPlayer {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [imageSrc, setImageSrc] = useState(stickerUrl);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!audioUrl) return;
    const audio = new Audio(audioUrl);
    audio.preload = "auto";
    const onTime = () => setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    const onMeta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
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
    setImageSrc(`${stickerUrl}?r=${Date.now()}`);
    const audio = audioRef.current;
    if (!audio || muted) return;
    audio.currentTime = 0;
    void audio.play().catch(() => setPlaying(false));
  }, [stickerUrl, muted]);

  const pause = useCallback(() => audioRef.current?.pause(), []);

  const toggleMute = useCallback(() => {
    const next = !muted;
    if (next) audioRef.current?.pause();
    setMuted(next);
  }, [muted]);

  return { imageSrc, hasAudio: Boolean(audioUrl), playing, muted, progress, duration, play, pause, toggleMute };
}
