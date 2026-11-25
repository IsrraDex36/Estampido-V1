import { cn } from "@/lib/utils";

/**
 * 8-bit music-game backdrop for the hero: a VU-meter "stage" of pixel blocks
 * jumping in steps, plus twinkling pixel stars. Deterministic pseudo-random
 * timings (no Math.random → stable renders).
 */
const BARS = 36;
const STARS = 26;
const rand = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export function PixelStage({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)}>
      {/* stars */}
      {Array.from({ length: STARS }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: static decoration
          key={i}
          className="pixel-twinkle absolute size-[3px] bg-foreground/50 dark:bg-white/70"
          style={{
            left: `${rand(i, 1) * 100}%`,
            top: `${rand(i, 2) * 62}%`,
            animationDelay: `${-rand(i, 3) * 2.6}s`,
            animationDuration: `${2 + rand(i, 4) * 2}s`,
          }}
        />
      ))}
      {/* VU-meter stage, fading out toward the headline; sm+ only (on phones the text spans the width) */}
      <div className="eq-fade absolute inset-x-0 bottom-0 hidden h-44 items-end justify-between gap-[3px] opacity-35 sm:flex dark:opacity-45">
        {Array.from({ length: BARS }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: static decoration
            key={i}
            className="eq-column eq-bar h-full flex-1"
            style={{ animationDuration: `${1.6 + rand(i, 5) * 1.8}s`, animationDelay: `${-rand(i, 6) * 2.4}s` }}
          />
        ))}
      </div>
    </div>
  );
}
