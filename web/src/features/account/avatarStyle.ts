import type { AvatarColor } from "@contract";

/** Pastel backgrounds that keep emojis readable in light and dark. */
export const AVATAR_BG: Record<AvatarColor, string> = {
  lime: "bg-[#c8f27a]",
  pink: "bg-[#ffb3d1]",
  sky: "bg-[#a8dcff]",
  amber: "bg-[#ffd97a]",
  violet: "bg-[#cdb8ff]",
  coral: "bg-[#ffb59e]",
  mint: "bg-[#a7f3d0]",
  teal: "bg-[#99e6e6]",
  sand: "bg-[#eadcbf]",
  slate: "bg-[#cbd5e1]",
};

/** The same colors as hex, for the profile banner gradient. */
export const AVATAR_HEX: Record<AvatarColor, string> = {
  lime: "#c8f27a",
  pink: "#ffb3d1",
  sky: "#a8dcff",
  amber: "#ffd97a",
  violet: "#cdb8ff",
  coral: "#ffb59e",
  mint: "#a7f3d0",
  teal: "#99e6e6",
  sand: "#eadcbf",
  slate: "#cbd5e1",
};

/** Spanish names for the color picker (screen readers and tooltips). */
export const AVATAR_COLOR_NAME: Record<AvatarColor, string> = {
  lime: "Lima",
  pink: "Rosa",
  sky: "Cielo",
  amber: "Ámbar",
  violet: "Violeta",
  coral: "Coral",
  mint: "Menta",
  teal: "Turquesa",
  sand: "Arena",
  slate: "Gris azulado",
};

export const parseAvatar = (avatar: string): { emoji: string; color: AvatarColor } => {
  const [emoji, color = ""] = avatar.split(" ");
  return { emoji: emoji || "🐸", color: (color in AVATAR_BG ? color : "lime") as AvatarColor };
};

