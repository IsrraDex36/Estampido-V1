import * as m from "motion/react-m";
import { cn } from "@/lib/utils";

const HEIGHTS = [0.35, 0.6, 0.9, 0.55, 1, 0.7, 0.4, 0.8, 0.5, 0.95, 0.65, 0.3, 0.75, 0.45];

/**
 * Audio-waveform loader. Animates `scaleY` only (compositor-friendly);
 * MotionConfig reducedMotion="user" freezes it for reduced-motion users.
 */
export function Waveform({ className, active = true }: { className?: string; active?: boolean }) {
  return (
    <span className={cn("flex h-16 items-center gap-1.5", className)} aria-hidden>
      {HEIGHTS.map((h, i) => (
        <m.span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative bars
          key={i}
          className="h-full w-1.5 origin-center rounded-full bg-current"
          initial={{ scaleY: h * 0.4 }}
          animate={active ? { scaleY: [h * 0.35, h, h * 0.5, h * 0.85, h * 0.35] } : { scaleY: h * 0.4 }}
          transition={{ duration: 1.2 + (i % 4) * 0.15, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut", delay: i * 0.06 }}
        />
      ))}
    </span>
  );
}

/** Tiny "now playing" equalizer. */
export function Equalizer({ className }: { className?: string }) {
  return (
    <span className={cn("flex h-3.5 items-end gap-[2px]", className)} aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <m.span
          key={i}
          className="h-full w-[3px] origin-bottom rounded-full bg-current"
          animate={{ scaleY: [0.3, 1, 0.45, 0.85, 0.3] }}
          transition={{ duration: 0.9 + i * 0.13, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut", delay: i * 0.08 }}
        />
      ))}
    </span>
  );
}
