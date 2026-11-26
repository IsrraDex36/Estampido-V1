/**
 * Picture adjustments applied to the source frames before framing (so the
 * blurred background and the picture always match): color filters and mirror.
 */
export const COLOR_LOOKS = ["bn", "vivo", "retro", "frio", "calido"] as const;
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
    default:
      return [];
  }
}

/** Every adjustment as a filter list, in order. Pure. */
export function adjustFilters(a: FrameAdjust | undefined): string[] {
  return [...(a?.flip ? ["hflip"] : []), ...lookFilters(a?.look)];
}
