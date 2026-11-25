import type { CommunitySticker } from "@contract";
import { Link } from "wouter";
import {
  BookmarkIcon,
  DownloadIcon,
  PauseIcon,
  PlayIcon,
  Share2Icon,
  UseSoundIcon,
  Volume2Icon,
  VolumeXIcon,
} from "@/components/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { remixHref } from "@/app/routes";
import { downloadUrl } from "@/lib/api";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { shareLink } from "../data/share";
import { categoryById } from "../model";
import { useFavorites } from "../store/favoritesStore";
import { usePreview } from "../store/previewStore";

/** A published sticker: tap the cover to hear it; save, use its sound, share, download. */
export function StickerCard({ sticker, rank, className }: { sticker: CommunitySticker; rank?: number; className?: string }) {
  const saved = useFavorites((s) => sticker.id in s.stickers);
  const toggleSaved = useFavorites((s) => s.toggleSticker);
  const playing = usePreview((s) => sticker.sound !== null && s.playing === sticker.sound.url);
  const togglePlay = usePreview((s) => s.toggle);
  const cat = categoryById(sticker.category);

  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-3xl bg-muted/40 ring-1 ring-border/60 transition-shadow hover:ring-foreground/20",
        className,
      )}
    >
      <div className="relative aspect-square bg-stage">
        <img src={sticker.stickerUrl} alt={sticker.title} loading="lazy" decoding="async" className="size-full object-contain p-3" />
        {sticker.sound ? (
          <button
            type="button"
            onClick={() => sticker.sound && togglePlay(sticker.sound.url)}
            aria-label={playing ? `Pausar «${sticker.title}»` : `Escuchar «${sticker.title}»`}
            aria-pressed={playing}
            className="absolute inset-0 grid place-items-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <span
              className={cn(
                "grid size-11 place-items-center rounded-full bg-background/80 text-foreground shadow-lg backdrop-blur transition-opacity",
                playing ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
              )}
            >
              {playing ? <PauseIcon className="size-5" weight="fill" /> : <PlayIcon className="size-5 translate-x-px" weight="fill" />}
            </span>
          </button>
        ) : null}
        <span
          className={cn(
            "pointer-events-none absolute top-2.5 left-2.5 flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums",
            playing ? "bg-sound text-white" : "bg-card/85 text-muted-foreground",
          )}
        >
          {sticker.sound ? (
            <>
              <Volume2Icon className={cn("size-3", !playing && "text-sound")} weight="fill" />
              {formatTime(sticker.sound.durationSec)}
            </>
          ) : (
            <>
              <VolumeXIcon className="size-3" /> mudo
            </>
          )}
        </span>
        {rank !== undefined && (
          <span className="pointer-events-none absolute top-2.5 right-2.5 font-pixel text-[11px] text-muted-foreground">
            #{rank}
          </span>
        )}
      </div>

      <div className="space-y-2 p-3">
        <div className="min-w-0">
          <h3 className="truncate text-[14px] font-medium tracking-tight" title={sticker.title}>
            {sticker.title}
          </h3>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-muted-foreground">
            {cat && (
              <span>
                {cat.emoji} {cat.label}
              </span>
            )}
            {sticker.uses > 0 && <span>· {sticker.uses} {sticker.uses === 1 ? "uso" : "usos"}</span>}
          </p>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <IconAction label={saved ? "Quitar de guardados" : "Guardar"} pressed={saved} onClick={() => toggleSaved(sticker)}>
            <BookmarkIcon className={cn("size-[18px]", saved && "text-foreground")} weight={saved ? "fill" : "bold"} />
          </IconAction>
          {sticker.sound ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={remixHref(sticker.id)}
                  aria-label="Usar este sonido en mi clip"
                  className="flex items-center gap-1 rounded-full px-2 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <UseSoundIcon className="size-[18px] text-sound" weight="duotone" />
                  Usar
                </Link>
              </TooltipTrigger>
              <TooltipContent>Usar este sonido en tu video, GIF o foto</TooltipContent>
            </Tooltip>
          ) : (
            <span className="w-14" />
          )}
          <IconAction label="Compartir" onClick={() => void shareLink(sticker.title, sticker.stickerUrl)}>
            <Share2Icon className="size-[18px]" />
          </IconAction>
          <a
            href={downloadUrl(sticker.stickerUrl)}
            aria-label="Descargar sticker"
            className="grid size-8 place-items-center rounded-full transition-colors hover:bg-muted hover:text-foreground"
          >
            <DownloadIcon className="size-[18px]" />
          </a>
        </div>
      </div>
    </article>
  );
}

function IconAction({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-full transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

/** Loading variant: same box, shimmer. */
export function StickerCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-3xl bg-muted/40 ring-1 ring-border/60", className)} aria-hidden>
      <div className="shimmer aspect-square bg-muted" />
      <div className="space-y-3 p-3">
        <div className="shimmer h-3 w-3/4 rounded-full bg-muted" />
        <div className="shimmer h-2.5 w-1/2 rounded-full bg-muted" />
        <div className="shimmer h-7 rounded-full bg-muted" />
      </div>
    </div>
  );
}
