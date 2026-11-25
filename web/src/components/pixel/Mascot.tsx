import { cn } from "@/lib/utils";
import { PixelSprite } from "./PixelSprite";

/**
 * "Pum" — Estampido's mascot: a living sticker (peeled top-right corner)
 * that shouts sound waves. Original 22×16 pixel art.
 *  k outline · w body · g peeled fold · e eyes · p cheeks · m mouth
 *  1/2/3 sound-wave arcs (animated in sequence when singing)
 */
const ROWS = [
  "..kkkkkkkkk...........",
  ".kwwwwwwwwwk..........",
  "kwwwwwwwwwwgk.........",
  "kwwwwwwwwwwggk........",
  "kwwwwwwwwwwkkkk.......",
  "kwwewwwwwewwwwk.......",
  "kwwewwwwwewwwwk...3...",
  "kwwwwwwwwwwwwwk.2..3..",
  "kwpwwwkkwwwwpwk..2..3.",
  "kwwwwkmmkwwwwwk1.2..3.",
  "kwwwwkmmkwwwwwk1.2..3.",
  "kwwwwwkkwwwwwwk..2..3.",
  "kwwwwwwwwwwwwwk.2..3..",
  ".kwwwwwwwwwwwk.....3..",
  "..kkkkkkkkkkk.........",
  "......................",
];

const PALETTE = {
  k: "#1d1d1f",
  w: "#ffffff",
  g: "#c9c9cf",
  e: "#1d1d1f",
  p: "#ff8fb1",
  m: "#e5484d",
  "1": "var(--sound)",
  "2": "var(--sound)",
  "3": "var(--sound)",
};

export type MascotMood = "idle" | "singing";

/** Pum. idle: bobs and blinks. singing: waves pulse out of its mouth. */
export function Mascot({
  size = 64,
  mood = "idle",
  still = false,
  className,
}: {
  size?: number;
  mood?: MascotMood;
  /** No bob (e.g. header logo). */
  still?: boolean;
  className?: string;
}) {
  const singing = mood === "singing";
  return (
    <span className={cn("inline-block", !still && "pixel-bob", className)}>
      <PixelSprite
        rows={ROWS}
        palette={PALETTE}
        size={size}
        title="Pum, la mascota de Estampido"
        keyClassName={{
          e: "pixel-blink",
          "1": singing ? "pixel-wave pixel-wave-1" : "opacity-0",
          "2": singing ? "pixel-wave pixel-wave-2" : "opacity-0",
          "3": singing ? "pixel-wave pixel-wave-3" : "opacity-0",
        }}
      />
    </span>
  );
}
