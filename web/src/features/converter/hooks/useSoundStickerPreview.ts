import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Mimics WhatsApp sound-sticker behaviour: tap → restart animation + play audio
 * once. Restarting an animated WebP requires reloading its src.
 * Mount with `key={stickerUrl}` so state resets per result.
 */
export function useSoundStickerPreview(stickerUrl: string, audioUrl: string | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [imageSrc, setImageSrc] = useState(stickerUrl);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!audioUrl) {
      audioRef.current = null;
      return;
    }
    const audio = new Audio(audioUrl);
    audio.preload = "auto";
    audio.onended = () => setPlaying(false);
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [stickerUrl, audioUrl]);

  const play = useCallback(() => {
    setImageSrc(`${stickerUrl}?r=${Date.now()}`);
    const audio = audioRef.current;
    if (!audio || muted) return;
    audio.currentTime = 0;
    void audio.play().then(
      () => setPlaying(true),
      () => setPlaying(false),
    );
  }, [stickerUrl, muted]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      if (!m) {
        audioRef.current?.pause();
        setPlaying(false);
      }
      return !m;
    });
  }, []);

  return { imageSrc, playing, muted, hasAudio: Boolean(audioUrl), play, toggleMute };
}
