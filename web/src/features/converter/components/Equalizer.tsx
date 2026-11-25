import { motion } from "motion/react";

/** Animated "now playing" bars. */
export function Equalizer({ bars = 4, className }: { bars?: number; className?: string }) {
  return (
    <span className={className} aria-hidden>
      <span className="flex h-3.5 items-end gap-[2px]">
        {Array.from({ length: bars }, (_, i) => (
          <motion.span
            // biome-ignore lint/suspicious/noArrayIndexKey: static decorative bars
            key={i}
            className="w-[3px] rounded-full bg-current"
            animate={{ height: ["30%", "100%", "45%", "85%", "30%"] }}
            transition={{ duration: 0.9 + i * 0.13, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut", delay: i * 0.08 }}
          />
        ))}
      </span>
    </span>
  );
}
