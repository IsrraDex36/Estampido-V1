import { useEffect, useRef, useState } from "react";
import { buildTimeline, type FrameTimeline, frameAt } from "@/lib/frameTimeline";
import { cn } from "@/lib/utils";

export type StickerMode = "idle" | "playing" | "paused";

interface Decoded {
  timeline: FrameTimeline;
  frames: (ImageBitmap | null)[];
  width: number;
  height: number;
}

const supported = () => typeof window !== "undefined" && "ImageDecoder" in window;

/**
 * An animated sticker whose picture follows its sound. Frames are decoded with
 * WebCodecs (ImageDecoder) and drawn on a canvas at the audio's current time:
 * playing → in lockstep with the sound, paused → frozen on the same frame,
 * idle → loops on its own like in a chat. Decoding starts on first play (or
 * right away with `eager`), so long feeds stay light. Without ImageDecoder it
 * falls back to the plain <img>, restarted when the sound starts.
 */
export function SyncedSticker({
  src,
  alt,
  mode,
  getTime,
  eager = false,
  className,
}: {
  src: string;
  alt: string;
  mode: StickerMode;
  /** Sound position (s) while playing/paused. */
  getTime: () => number;
  eager?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [decoded, setDecoded] = useState<{ src: string; d: Decoded } | null>(null);
  const [wanted, setWanted] = useState(eager);
  const [restarts, setRestarts] = useState(0);
  const modeRef = useRef(mode);
  const getTimeRef = useRef(getTime);
  useEffect(() => {
    modeRef.current = mode;
    getTimeRef.current = getTime;
  });

  // Mode transitions, derived during render (React's «store info from previous renders»):
  // first play → start decoding; idle → playing → restart the fallback <img>.
  const [prevMode, setPrevMode] = useState(mode);
  if (prevMode !== mode) {
    setPrevMode(mode);
    if (mode !== "idle" && !wanted) setWanted(true);
    if (prevMode === "idle" && mode === "playing") setRestarts((n) => n + 1);
  }

  // Decode once (per src), only when needed.
  useEffect(() => {
    if (!wanted || !supported()) return;
    let alive = true;
    const bitmaps: ImageBitmap[] = [];
    (async () => {
      const buf = await (await fetch(src)).arrayBuffer();
      const decoder = new ImageDecoder({ data: buf, type: "image/webp" });
      await decoder.tracks.ready;
      const count = decoder.tracks.selectedTrack?.frameCount ?? 1;
      if (count <= 1) {
        decoder.close();
        return; // still image: the <img> is already right
      }
      const durations: number[] = [];
      const frames: (ImageBitmap | null)[] = Array.from({ length: count }, () => null);
      for (let i = 0; i < count && alive; i++) {
        const { image } = await decoder.decode({ frameIndex: i });
        durations.push((image.duration ?? 100_000) / 1000);
        const bmp = await createImageBitmap(image);
        image.close();
        bitmaps.push(bmp);
        frames[i] = bmp;
      }
      decoder.close();
      if (!alive) return;
      const first = frames[0] as ImageBitmap;
      setDecoded({ src, d: { timeline: buildTimeline(durations), frames, width: first.width, height: first.height } });
    })().catch(() => {
      // Unsupported/corrupt: keep the <img>.
    });
    return () => {
      alive = false;
      for (const b of bitmaps) b.close();
    };
  }, [src, wanted]);

  const ready = decoded?.src === src ? decoded.d : null;

  // Draw loop: the frame for the sound's time (or a free-running clock when idle).
  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = ready.width;
    canvas.height = ready.height;
    let raf = 0;
    let last = -1;
    let idleOrigin = performance.now();
    let wasIdle = true;
    const tick = () => {
      const m = modeRef.current;
      const now = performance.now();
      if (m === "idle" && !wasIdle) idleOrigin = now; // after the sound: loop from the start
      wasIdle = m === "idle";
      const tMs = m === "idle" ? now - idleOrigin : getTimeRef.current() * 1000;
      const i = frameAt(ready.timeline, tMs);
      if (i !== last && ready.frames[i]) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(ready.frames[i] as ImageBitmap, 0, 0);
        last = i;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  if (ready) {
    return <canvas ref={canvasRef} role="img" aria-label={alt} className={cn("object-contain", className)} />;
  }
  const imgSrc = restarts > 0 && !supported() ? `${src}${src.includes("?") ? "&" : "?"}r=${restarts}` : src;
  return <img src={imgSrc} alt={alt} loading="lazy" decoding="async" className={className} />;
}
