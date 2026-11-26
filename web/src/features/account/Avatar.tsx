import { cn } from "@/lib/utils";
import { AVATAR_BG, parseAvatar } from "./avatarStyle";

/** A creator's avatar: their emoji on their color. Decorative unless `label` is given. */
export function Avatar({ avatar, size = 36, label, className }: { avatar: string; size?: number; label?: string; className?: string }) {
  const { emoji, color } = parseAvatar(avatar);
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("inline-grid shrink-0 place-items-center rounded-full ring-1 ring-black/5 select-none", AVATAR_BG[color], className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.55), lineHeight: 1 }}
    >
      {emoji}
    </span>
  );
}
