import { useCallback, useEffect, useRef, useState } from "react";
import { PauseIcon, PlayIcon, Volume2Icon, VolumeXIcon } from "@/components/icons";
import { usePreview } from "@/features/community/store/previewStore";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useFilmstrip } from "../../hooks/useFilmstrip";
import type { Span } from "../../model/trim";
import { useConverterStore } from "../../store/converterStore";
import { usePlaybackStore } from "../../store/playbackStore";
import { useSegment } from "../segment/useSegment";
import { Filmstrip, Trimmer } from "./Trimmer";

const FRAMES = 12;

/**
 * Video preview + trimmer. Playback loops inside the chosen stretch (like
 * WhatsApp's editor); dragging a grip shows that exact frame.
 */
export function VideoEditor({ url }: { url: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playheadRef = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);
  const resumeAfterDrag = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const chipRef = useRef<HTMLSpanElement>(null);

  const seg = useSegment();
  const update = useConverterStore((s) => s.updateOptions);
  const setCurrentTime = usePlaybackStore((s) => s.setCurrentTime);
  const setDuration = usePlaybackStore((s) => s.setDuration);
  const frames = useFilmstrip(url, seg.known ? seg.sourceDuration : undefined, FRAMES);

  const span: Span | null = seg.known && seg.end !== undefined ? { start: seg.start, end: seg.end } : null;
  const spanRef = useRef(span);
  useEffect(() => {
    spanRef.current = span;
  });

  const placePlayhead = useCallback((t: number) => {
    const v = videoRef.current;
    const el = playheadRef.current;
    if (el && v && v.duration > 0) el.style.left = `${(t / v.duration) * 100}%`;
    const s = spanRef.current;
    if (chipRef.current && s) {
      const within = Math.min(s.end - s.start, Math.max(0, t - s.start));
      chipRef.current.textContent = `${formatTime(within)} / ${formatTime(s.end - s.start)}`;
    }
  }, []);

  // A new start (fields, presets, trimmer) is shown right away.
  useEffect(() => {
    const v = videoRef.current;
    if (v && !dragging.current && Math.abs(v.currentTime - seg.start) > 0.25) v.currentTime = seg.start;
  }, [seg.start]);

  // While playing: loop inside the stretch and move the playhead smoothly.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      const s = spanRef.current;
      if (v) {
        if (s && !dragging.current && (v.currentTime >= s.end - 0.03 || v.currentTime < s.start - 0.3)) v.currentTime = s.start;
        placePlayhead(v.currentTime);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, placePlayhead]);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (!v.paused) {
      v.pause();
      return;
    }
    const s = spanRef.current;
    if (s && (v.currentTime < s.start || v.currentTime >= s.end - 0.05)) v.currentTime = s.start;
    usePreview.getState().stop(); // one sound at a time
    void v.play().catch(() => {});
  };

  const commit = (next: Span) => update({ startSec: next.start, durationSec: Math.round((next.end - next.start) * 10) / 10 });
  const scrub = (sec: number) => {
    const v = videoRef.current;
    if (!v) return;
    if (!v.paused) v.pause();
    v.currentTime = sec;
  };
  const onDragging = (on: boolean) => {
    const v = videoRef.current;
    dragging.current = on;
    if (!v) return;
    if (on) {
      resumeAfterDrag.current = !v.paused;
      return;
    }
    const s = spanRef.current;
    if (s) v.currentTime = s.start;
    if (resumeAfterDrag.current) void v.play().catch(() => {});
  };

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl bg-black">
        {/* biome-ignore lint/a11y/useMediaCaption: user-supplied preview */}
        <video
          ref={videoRef}
          src={url}
          playsInline
          muted={muted}
          preload="metadata"
          className="aspect-video w-full cursor-pointer object-contain"
          onClick={toggle}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            const v = videoRef.current;
            const s = spanRef.current;
            if (v && s) {
              v.currentTime = s.start;
              void v.play().catch(() => {});
            }
          }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onSeeked={(e) => {
            placePlayhead(e.currentTarget.currentTime);
          }}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration);
            placePlayhead(e.currentTarget.currentTime);
          }}
        />
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pausar" : "Reproducir el tramo"}
          className={cn(
            "absolute top-1/2 left-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-opacity focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none",
            playing ? "pointer-events-none opacity-0" : "opacity-100",
          )}
        >
          {playing ? <PauseIcon className="size-7" weight="fill" /> : <PlayIcon className="ml-1 size-7" weight="fill" />}
        </button>
        {span && (
          <span
            ref={chipRef}
            className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/45 px-2.5 py-1 font-mono text-[12px] text-white tabular-nums backdrop-blur-sm"
          >
            {formatTime(0)} / {formatTime(span.end - span.start)}
          </span>
        )}
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? "Activar sonido" : "Silenciar"}
          aria-pressed={muted}
          className="absolute right-3 bottom-3 grid size-9 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
        >
          {muted ? <VolumeXIcon className="size-4" /> : <Volume2Icon className="size-4" />}
        </button>
      </div>

      {span ? (
        <Trimmer
          strip={<Filmstrip frames={frames} />}
          label="Recortar el video: arrastra los bordes o el marco"
          span={span}
          limits={{ total: seg.sourceDuration, min: seg.minDuration, max: seg.maxDuration }}
          disabled={seg.disabled}
          playheadRef={playheadRef}
          onChange={commit}
          onScrub={scrub}
          onDragging={onDragging}
        />
      ) : (
        <div className="h-[5.5rem] animate-pulse rounded-lg bg-muted motion-reduce:animate-none" aria-hidden />
      )}
    </div>
  );
}
