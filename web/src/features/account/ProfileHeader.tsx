import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Avatar } from "./Avatar";
import { AVATAR_HEX, parseAvatar } from "./avatarStyle";

/**
 * How a creator looks: a banner in their avatar's color, the avatar
 * overlapping it, name, @handle, since when, bio and actions. Used by the
 * public profile and, live while editing, by «Mi cuenta» («Así te ven»).
 */
export function ProfileHeader({
  displayName,
  handle,
  bio,
  avatar,
  since,
  actions,
  compact = false,
  className,
}: {
  displayName: string;
  handle: string;
  bio?: string;
  avatar: string;
  /** e.g. «desde noviembre de 2026» */
  since?: string;
  actions?: ReactNode;
  /** Sidebar preview: smaller, always stacked. */
  compact?: boolean;
  className?: string;
}) {
  const { color } = parseAvatar(avatar);
  const hex = AVATAR_HEX[color];
  return (
    <div className={cn("overflow-hidden rounded-3xl bg-muted/40 ring-1 ring-border/60", className)}>
      <div
        aria-hidden
        className={compact ? "h-16" : "h-24 sm:h-32"}
        style={{ background: `linear-gradient(120deg, ${hex} 0%, ${hex}99 45%, ${hex}22 100%)` }}
      />
      <div className="px-5 pb-5">
        {/* Only the avatar overlaps the banner; text always sits on the card (readable on any color). */}
        <div className={cn("flex items-end justify-between gap-3", compact ? "-mt-9" : "-mt-11 sm:-mt-14")}>
          <Avatar
            avatar={avatar}
            size={compact ? 72 : 104}
            label={`Avatar de ${displayName}`}
            className="ring-4 ring-background"
          />
          {actions && !compact && <div className="hidden flex-wrap justify-end gap-2 pb-1 sm:flex">{actions}</div>}
        </div>
        <div className="mt-3 min-w-0 space-y-1">
          <h1 className={cn("display break-words", compact ? "text-2xl" : "text-3xl sm:text-4xl")}>{displayName || "Tu nombre"}</h1>
          <p className="text-[14px] text-muted-foreground">
            @{handle || "usuario"}
            {since ? ` · ${since}` : ""}
          </p>
        </div>
        {actions && <div className={cn("mt-3 flex flex-wrap gap-2", !compact && "sm:hidden")}>{actions}</div>}
      </div>
      {bio ? (
        <p className="-mt-2 max-w-prose px-5 pb-5 text-[15px] whitespace-pre-line text-pretty break-words">{bio}</p>
      ) : compact ? (
        <p className="-mt-2 px-5 pb-5 text-[13px] text-muted-foreground italic">Sin descripción todavía.</p>
      ) : null}
    </div>
  );
}
