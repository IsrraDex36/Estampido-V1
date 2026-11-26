import type { ColorLook } from "@contract";

export const LOOK_LABELS: Record<ColorLook, string> = {
  bn: "B/N",
  vivo: "Vivo",
  retro: "Retro",
  frio: "Frío",
  calido: "Cálido",
};

/** CSS look-alikes of the server's ffmpeg filters (preview only; close, not pixel-exact). */
export const LOOK_CSS: Record<ColorLook, string> = {
  bn: "grayscale(1)",
  vivo: "saturate(1.45) contrast(1.08)",
  retro: "sepia(0.85) contrast(0.95)",
  frio: "saturate(1.05) hue-rotate(-14deg) brightness(1.03)",
  calido: "sepia(0.28) saturate(1.25) hue-rotate(-8deg)",
};

export interface PreviewAdjust {
  look?: ColorLook;
  flip?: boolean;
}
