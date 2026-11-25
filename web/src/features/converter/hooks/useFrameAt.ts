import { useEffect, useRef, useState } from "react";

const HEIGHT = 180;

/**
 * Snapshot of the clip at `time` (debounced while it changes), from a hidden
 * <video> of its own. null until the first frame is ready.
 */
export function useFrameAt(url: string | null, time: number | undefined, delayMs = 140): string | null {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [shot, setShot] = useState<{ url: string; src: string } | null>(null);

  useEffect(() => {
    if (!url) return;
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    videoRef.current = v;
    return () => {
      videoRef.current = null;
      v.removeAttribute("src");
      v.load();
    };
  }, [url]);

  useEffect(() => {
    const v = videoRef.current;
    if (!url || !v || time === undefined) return;
    let alive = true;
    const grab = () => {
      if (!alive || !v.videoWidth) return;
      const c = document.createElement("canvas");
      c.height = HEIGHT;
      c.width = Math.round((HEIGHT * v.videoWidth) / v.videoHeight);
      c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
      setShot({ url, src: c.toDataURL("image/jpeg", 0.75) });
    };
    const timer = setTimeout(() => {
      const seek = () => {
        v.addEventListener("seeked", grab, { once: true });
        v.currentTime = Math.max(0, Math.min(time, (v.duration || time) - 0.05));
      };
      if (v.readyState >= 1) seek();
      else v.addEventListener("loadedmetadata", seek, { once: true });
    }, delayMs);
    return () => {
      alive = false;
      clearTimeout(timer);
      v.removeEventListener("seeked", grab);
    };
  }, [url, time, delayMs]);

  return shot?.url === url ? shot.src : null;
}
