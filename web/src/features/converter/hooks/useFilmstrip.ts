import { useEffect, useState } from "react";

const THUMB_HEIGHT = 96; // px, 2× the strip height for sharp frames

type Strip = { url: string; frames: (string | null)[] };

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      video.removeEventListener("seeked", done);
      resolve();
    };
    const timer = setTimeout(done, 3000); // never hang on a stubborn codec
    video.addEventListener("seeked", done);
    video.currentTime = time;
  });
}

function ready(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    video.addEventListener("loadeddata", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(new Error("video")), { once: true });
  });
}

/**
 * Evenly spaced frames of the clip for the trimmer, filled in one by one
 * (null = not yet). Uses its own hidden <video>, so the preview isn't touched.
 */
export function useFilmstrip(url: string | null, duration: number | undefined, count: number): (string | null)[] {
  const [strip, setStrip] = useState<Strip | null>(null);

  useEffect(() => {
    if (!url || !duration || !(duration > 0)) return;
    let alive = true;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    const canvas = document.createElement("canvas");
    const frames: (string | null)[] = Array.from({ length: count }, () => null);

    (async () => {
      await ready(video);
      const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
      canvas.height = THUMB_HEIGHT;
      canvas.width = Math.round(THUMB_HEIGHT * Math.min(2, Math.max(0.5, aspect)));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      for (let i = 0; i < count && alive; i++) {
        await seek(video, Math.min(duration - 0.05, ((i + 0.5) / count) * duration));
        if (!alive) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames[i] = canvas.toDataURL("image/jpeg", 0.7);
        setStrip({ url, frames: [...frames] });
      }
    })().catch(() => {
      // No frames (codec/browser): the trimmer still works on a plain track.
    });

    return () => {
      alive = false;
      video.removeAttribute("src");
      video.load();
    };
  }, [url, duration, count]);

  return strip?.url === url ? strip.frames : Array.from({ length: count }, () => null);
}
