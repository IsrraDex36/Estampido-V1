import { PlayIcon } from "lucide-react";
import { GhostBlock } from "./Ghost";

/** Deterministic pseudo-waveform heights (no randomness during render). */
const WAVE = Array.from({ length: 28 }, (_, i) => ({
  id: `bar-${i}`,
  height: 0.25 + 0.75 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)),
  fade: (i % 5) * 0.08,
}));

/** Sounds many stickers reuse: play it, then «usar este sonido» (remix, phase 4). */
export function TrendingSounds() {
  return (
    <ol className="space-y-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <li key={n} className="flex items-center gap-3 rounded-xl px-2 py-2">
          <span className="w-4 font-pixel text-[11px] text-muted-foreground">{n}</span>
          <button
            type="button"
            disabled
            aria-label="Escuchar (pronto)"
            className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-foreground/20 text-muted-foreground"
          >
            <PlayIcon className="size-3.5 translate-x-px" />
          </button>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex h-4 items-center gap-[2px]" aria-hidden>
              {WAVE.map((bar) => (
                <span
                  key={bar.id}
                  className="w-[3px] rounded-full bg-sound/35"
                  style={{ height: `${Math.round(bar.height * 100)}%`, opacity: 1 - bar.fade }}
                />
              ))}
            </div>
            <GhostBlock className="h-2 w-20" />
          </div>
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">– usos</span>
        </li>
      ))}
    </ol>
  );
}
