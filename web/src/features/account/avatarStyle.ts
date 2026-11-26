import type { AvatarColor } from "@contract";

/** Pastel backgrounds that keep emojis readable in light and dark. */
export const AVATAR_BG: Record<AvatarColor, string> = {
  lime: "bg-[#c8f27a]",
  pink: "bg-[#ffb3d1]",
  sky: "bg-[#a8dcff]",
  amber: "bg-[#ffd97a]",
  violet: "bg-[#cdb8ff]",
  coral: "bg-[#ffb59e]",
};

export const parseAvatar = (avatar: string): { emoji: string; color: AvatarColor } => {
  const [emoji, color = ""] = avatar.split(" ");
  return { emoji: emoji || "🐸", color: (color in AVATAR_BG ? color : "lime") as AvatarColor };
};

