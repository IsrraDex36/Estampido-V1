import { BookmarkIcon, MoreHorizontalIcon, SendIcon, Share2Icon, Volume2Icon, VoteIcon } from "@/components/icons";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { GhostBlock } from "./Ghost";

/**
 * Final card anatomy with no data: sound length, sticker, author/tag and the
 * four actions (vote, save, share, send). Actions are present but disabled.
 */
export function StickerCardPlaceholder({ rank, className }: { rank?: number; className?: string }) {
  return (
    <article className={cn("group flex flex-col overflow-hidden rounded-3xl bg-muted/40 ring-1 ring-border/60", className)}>
      <div className="relative grid aspect-square place-items-center bg-stage">
        <span className="absolute top-2.5 left-2.5 flex items-center gap-1 rounded-full bg-card/80 px-2 py-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
          <Volume2Icon className="size-3 text-sound" weight="fill" />
          –:––
        </span>
        {rank !== undefined && (
          <span className="absolute top-2.5 right-2.5 font-pixel text-[11px] text-muted-foreground">#{rank}</span>
        )}
        <div className="size-1/2 rounded-2xl border border-dashed border-foreground/15" aria-hidden />
      </div>
      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <GhostBlock className="h-2.5 w-16" />
          <GhostBlock className="h-2.5 w-10" />
        </div>
        <div className="flex items-center justify-between text-muted-foreground/60">
          <Action icon={VoteIcon} label="Votar" count />
          <Action icon={BookmarkIcon} label="Guardar" />
          <Action icon={Share2Icon} label="Compartir" />
          <Action icon={SendIcon} label="Enviar a WhatsApp" />
          <Action icon={MoreHorizontalIcon} label="Más opciones" />
        </div>
      </div>
    </article>
  );
}

function Action({ icon: Icon, label, count }: { icon: ComponentType<{ className?: string }>; label: string; count?: boolean }) {
  return (
    <button
      type="button"
      disabled
      aria-label={`${label} (pronto)`}
      title="Pronto"
      className="flex items-center gap-1 rounded-full p-1.5 text-[12px] tabular-nums"
    >
      <Icon className="size-4" />
      {count && <span>–</span>}
    </button>
  );
}

/** Loading variant (real fetch, phase 2+): same box, shimmer instead of dashed frames. */
export function StickerCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-3xl bg-muted/40 ring-1 ring-border/60", className)} aria-hidden>
      <div className="shimmer aspect-square bg-muted" />
      <div className="space-y-3 p-3">
        <div className="flex justify-between">
          <div className="shimmer h-2.5 w-16 rounded-full bg-muted" />
          <div className="shimmer h-2.5 w-10 rounded-full bg-muted" />
        </div>
        <div className="shimmer h-7 rounded-full bg-muted" />
      </div>
    </div>
  );
}
