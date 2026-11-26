/**
 * Picture adjustments applied to the source frames before framing (so the
 * blurred background and the picture always match): color filters and mirror.
 */
export const COLOR_LOOKS = [
  "bn",
  "vivo",
  "retro",
  "frio",
  "calido",
  "noir",
  "cine",
  "suave",
  "negativo",
  "rosa",
] as const;
export type ColorLook = (typeof COLOR_LOOKS)[number];

export interface FrameAdjust {
  look?: ColorLook;
  /** Mirror horizontally. */
  flip?: boolean;
}

/** ffmpeg filters for a look (empty for none). Pure. */
export function lookFilters(look: ColorLook | undefined): string[] {
  switch (look) {
    case "bn":
      return ["hue=s=0"];
    case "vivo":
      return ["eq=saturation=1.45:contrast=1.08"];
    case "retro":
      // Sepia matrix, slightly flattened.
      return ["colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131", "eq=contrast=0.95"];
    case "frio":
      return ["colorbalance=rs=-0.1:bs=0.15:rm=-0.05:bm=0.08"];
    case "calido":
      return ["colorbalance=rs=0.15:bs=-0.12:rm=0.08:bm=-0.05"];
    case "noir":
      return ["hue=s=0", "eq=contrast=1.45"];
    case "cine":
      // Teal shadows, warm highlights.
      return ["colorbalance=rs=-0.08:gs=-0.02:bs=0.12:rh=0.12:gh=0.04:bh=-0.1", "eq=contrast=1.08:saturation=1.15"];
    case "suave":
      return ["eq=contrast=0.85:brightness=0.05:saturation=0.75"];
    case "negativo":
      return ["negate"];
    case "rosa":
      return ["colorbalance=rs=0.12:bs=0.08:gs=-0.06:rm=0.1:bm=0.05"];
    default:
      return [];
  }
}

/** Every adjustment as a filter list, in order. Pure. */
export function adjustFilters(a: FrameAdjust | undefined): string[] {
  return [...(a?.flip ? ["hflip"] : []), ...lookFilters(a?.look)];
}
