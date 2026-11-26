import type { PackSummary } from "@contract";
import { Link } from "wouter";
import { packHref } from "@/app/routes";
import { Avatar } from "@/features/account/Avatar";
import { cn } from "@/lib/utils";

/** A pack: 2×2 mosaic of its first stickers, name, owner and count. Same height for every card. */
export function PackCard({ pack, showOwner = true, className }: { pack: PackSummary; showOwner?: boolean; className?: string }) {
  const tiles = [...pack.covers, ...Array(4).fill(null)].slice(0, 4) as (string | null)[];
  return (
    <Link
      href={packHref(pack.id)}
      className={cn(
        "flex h-full min-w-0 flex-col overflow-hidden rounded-3xl bg-muted/40 ring-1 ring-border/60 transition-colors hover:ring-foreground/20",
        className,
      )}
    >
      <div className="grid aspect-square grid-cols-2 gap-1 bg-stage p-2">
        {tiles.map((src, i) =>
          src ? (
            <img key={src} src={src} alt="" loading="lazy" className="size-full rounded-xl object-contain" />
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed empty slots
            <span key={`empty-${i}`} className="rounded-xl border border-dashed border-border/60" aria-hidden />
          ),
        )}
      </div>
      <div className="space-y-0.5 p-3">
        <p className="truncate text-[14px] font-semibold" title={pack.name}>
          {pack.name}
        </p>
        <p className="flex h-[18px] min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
          {showOwner && (
            <>
              <Avatar avatar={pack.owner.avatar} size={16} />
              <span className="truncate">@{pack.owner.handle}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <span className="shrink-0 tabular-nums">
            {pack.count} {pack.count === 1 ? "sticker" : "stickers"}
          </span>
        </p>
      </div>
    </Link>
  );
}
