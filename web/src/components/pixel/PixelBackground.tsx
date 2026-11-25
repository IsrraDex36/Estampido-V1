import type { CSSProperties } from "react";
import { PixelSprite } from "./PixelSprite";
import { NOTE, SPARK, STAR } from "./sprites";

/**
 * Pixel night sky behind the whole app: a starfield of tiny pixel stars (a
 * few tinted with the two accents: green and magenta) and musical notes drifting
 * in the margins. Fixed, decorative, low contrast. Positions/timings are
 * deterministic (no Math.random → stable renders, no layout shift).
 */
const rand = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const STARS = 70;
const TINTS = ["var(--retro-a)", "var(--sound)"];

const NOTES = [
  { rows: NOTE, x: "0.7%", y: "30%", size: 18, color: "var(--retro-a)" },
  { rows: STAR, x: "97.6%", y: "12%", size: 14, color: "var(--sound)" },
  { rows: NOTE, x: "97.8%", y: "46%", size: 16, color: "var(--sound)" },
  { rows: SPARK, x: "0.9%", y: "58%", size: 10, color: "var(--sound)" },
  { rows: NOTE, x: "0.7%", y: "84%", size: 14, color: "var(--sound)" },
  { rows: NOTE, x: "97.6%", y: "78%", size: 18, color: "var(--retro-a)" },
] as const;

function starStyle(i: number): { style: CSSProperties; sparkle: boolean } {
  const r = rand(i, 3);
  const sparkle = r > 0.93; // a few plus-shaped twinklers
  const size = r > 0.75 ? 3 : 2;
  const tinted = rand(i, 4) > 0.82;
  return {
    sparkle,
    style: {
      left: `${rand(i, 1) * 100}%`,
      top: `${rand(i, 2) * 100}%`,
      width: sparkle ? undefined : size,
      height: sparkle ? undefined : size,
      color: tinted ? TINTS[i % TINTS.length] : "var(--star)",
      backgroundColor: sparkle ? undefined : "currentColor",
      animationDelay: `${-rand(i, 5) * 4}s`,
      animationDuration: `${2.4 + rand(i, 6) * 3}s`,
    },
  };
}

export function PixelBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {Array.from({ length: STARS }, (_, i) => {
        const { style, sparkle } = starStyle(i);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: static decoration
          <span key={i} className="pixel-twinkle absolute" style={style}>
            {sparkle && <PixelSprite rows={SPARK} palette={{ k: "currentColor" }} size={9} />}
          </span>
        );
      })}
      {NOTES.map((n, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: static decoration
          key={i}
          className="pixel-float absolute hidden opacity-45 lg:block dark:opacity-60"
          style={{ left: n.x, top: n.y, color: n.color, animationDelay: `${-i * 0.9}s` }}
        >
          <PixelSprite rows={n.rows} palette={{ k: "currentColor" }} size={n.size} />
        </span>
      ))}
    </div>
  );
}
