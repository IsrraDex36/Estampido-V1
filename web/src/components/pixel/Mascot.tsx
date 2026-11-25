import { useEffect, useState } from "react";
import { sfx } from "@/lib/sfx";
import { cn } from "@/lib/utils";
import { PixelSprite } from "./PixelSprite";
import { PUM_H, PUM_LAYERS as LAYERS, PUM_NOTE as NOTE, PUM_NOTE_PALETTE as NOTE_PALETTE, PUM_PALETTE as PALETTE, PUM_W } from "./pum";

export type MascotMood = "idle" | "singing";

interface MascotProps {
  size?: number;
  mood?: MascotMood;
  /** No idle bob/shadow (e.g. header logo). */
  still?: boolean;
  /** Tap/click → jump + "¡PUM!" bubble and sound. */
  interactive?: boolean;
  className?: string;
}

/**
 * Pum. idle: hops, blinks, smiles. singing: dances (arms alternate), mouth
 * opens and closes, waves pulse out and notes float up.
 */
export function Mascot({ size = 64, mood = "idle", still = false, interactive = false, className }: MascotProps) {
  const singing = mood === "singing";
  const [jumping, setJumping] = useState(false);
  useEffect(() => {
    if (!jumping) return;
    const t = setTimeout(() => setJumping(false), 700);
    return () => clearTimeout(t);
  }, [jumping]);

  const height = (size * PUM_H) / PUM_W;
  const sprite = (rows: readonly string[], cls?: string, keyClassName?: Record<string, string>) => (
    <PixelSprite
      rows={rows}
      palette={PALETTE}
      size={size}
      className={cn("absolute inset-0", cls)}
      keyClassName={keyClassName}
    />
  );

  const figure = (
    <span
      className={cn("relative block", !still && (jumping ? "pum-jump" : singing ? "pum-dance" : "pixel-bob"))}
      style={{ width: size, height }}
    >
      {sprite(LAYERS.base, undefined, { e: "pixel-blink" })}
      {singing ? (
        <>
          {sprite(LAYERS.handsA, "pum-frame-a")}
          {sprite(LAYERS.handsB, "pum-frame-b")}
          {sprite(LAYERS.mouthOpen, "pum-mouth-a")}
          {sprite(LAYERS.mouthSmile, "pum-mouth-b")}
          {sprite(LAYERS.waves, undefined, { "1": "pixel-wave", "2": "pixel-wave pixel-wave-2", "3": "pixel-wave pixel-wave-3" })}
          {[0, 1].map((i) => (
            <span key={i} className={cn("pum-note absolute", i === 1 && "pum-note-2")} style={{ left: size * 0.82, top: 0 }}>
              <PixelSprite rows={NOTE} palette={NOTE_PALETTE} size={size * 0.16} />
            </span>
          ))}
        </>
      ) : (
        <>
          {sprite(jumping ? LAYERS.handsA : LAYERS.handsIdle)}
          {sprite(jumping ? LAYERS.mouthOpen : LAYERS.mouthSmile)}
        </>
      )}
      {jumping && (
        <span
          className="font-pixel absolute -top-3 left-1/2 -translate-x-1/2 -translate-y-full rounded-md bg-foreground px-1.5 py-0.5 text-[10px] whitespace-nowrap text-background"
          style={{ fontSize: Math.max(9, size * 0.1) }}
        >
          ¡PUM!
        </span>
      )}
    </span>
  );

  const shadow = !still && (
    <span
      aria-hidden
      className={cn("mx-auto mt-1 block rounded-[50%] bg-foreground/15", singing ? "pum-shadow-dance" : "pum-shadow")}
      style={{ width: size * 0.45, height: Math.max(3, size * 0.05) }}
    />
  );

  if (!interactive) {
    return (
      <span className={cn("inline-block", className)} role="img" aria-label="Pum, la mascota de Estampido">
        {figure}
        {shadow}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setJumping(true);
        sfx.pum(); // synthesized «pum», copyright-free (lib/sfx)
      }}
      aria-label="Pum, la mascota de Estampido. Tócalo."
      className={cn("inline-block cursor-pointer rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", className)}
    >
      {figure}
      {shadow}
    </button>
  );
}
