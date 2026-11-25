import { PixelSprite } from "./PixelSprite";
import { NOTE, SPARK, STAR, WAVE } from "./sprites";

/**
 * Fixed 80s backdrop: dithered pixel texture and a few drifting pixel
 * sprites (the synthwave grid lives in the hero so it scrolls away). Purely decorative, low contrast, behind content.
 */
// Kept to the page margins so they never sit behind headline/body text.
const FLOATERS = [
  { rows: STAR, x: "96%", y: "16%", size: 18, color: "var(--retro-b)", delay: "1.2s" },
  { rows: NOTE, x: "1.5%", y: "44%", size: 20, color: "var(--retro-a)", delay: "0s" },
  { rows: WAVE, x: "97%", y: "40%", size: 16, color: "var(--sound)", delay: "0.6s" },
  { rows: SPARK, x: "2%", y: "70%", size: 12, color: "var(--retro-b)", delay: "2s" },
  { rows: NOTE, x: "96.5%", y: "74%", size: 18, color: "var(--retro-a)", delay: "1.6s" },
  { rows: STAR, x: "1.5%", y: "90%", size: 14, color: "var(--sound)", delay: "0.9s" },
] as const;

export function PixelBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="pixel-dither absolute inset-0" />
      {FLOATERS.map((f, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: static decoration
          key={i}
          className="pixel-float absolute hidden opacity-40 md:block dark:opacity-50"
          style={{ left: f.x, top: f.y, color: f.color, animationDelay: f.delay }}
        >
          <PixelSprite rows={f.rows} palette={{ k: "currentColor" }} size={f.size} />
        </span>
      ))}
    </div>
  );
}
