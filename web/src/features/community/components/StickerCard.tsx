import type { CommunitySticker } from "@contract";
import { useState } from "react";
import { Link } from "wouter";
import {
  BookmarkIcon,
  DownloadIcon,
  FlagIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PlayIcon,
  Share2Icon,
  UseSoundIcon,
  VolumeXIcon,
} from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { creatorHref, remixHref } from "@/app/routes";
import { Avatar } from "@/features/account/Avatar";
import { downloadUrl } from "@/lib/api";
import { countLabel } from "@/lib/format";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { trackPlay } from "../plays";
import { shareLink } from "../share";
import { categoryById } from "../model";
import { useMe, useToggleFavorite } from "@/features/account/api";
import { useFavorites } from "../store/favoritesStore";
import { previewTime, usePreview, usePreviewMode } from "../store/previewStore";
import { SyncedSticker } from "@/components/SyncedSticker";
import { ReportDialog } from "./ReportDialog";
import { SendToWhatsAppButton } from "./SendToWhatsAppButton";

/** A published sticker: tap the cover to hear it; send it to WhatsApp, save, use its sound, share, download. */
export function StickerCard({ sticker, rank, className }: { sticker: CommunitySticker; rank?: number; className?: string }) {
  const saved = useFavorites((s) => sticker.id in s.stickers);
  const toggleFavorite = useToggleFavorite();
  const toggleSaved = () => toggleFavorite("sticker", sticker);
  const soundUrl = sticker.sound?.url ?? null;
  const mode = usePreviewMode(soundUrl);
  const playing = mode === "playing";
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
        <SyncedSticker
          src={sticker.stickerUrl}
          alt={sticker.title}
          mode={mode}
          getTime={() => (soundUrl ? previewTime(soundUrl) : 0)}
          className="size-full object-contain px-3 pt-3 pb-10"
        />
        {sticker.sound ? (
          // The whole cover is the play target (big, thumb-friendly); the only
          // visible control is a small corner pill, so the sticker stays clean.
          <button
            type="button"
            onClick={() => {
              if (!sticker.sound) return;
              if (mode === "idle") trackPlay(sticker.id);
              togglePlay(sticker.sound.url);
            }}
            aria-label={playing ? `Pausar «${sticker.title}»` : mode === "paused" ? `Continuar «${sticker.title}»` : `Escuchar «${sticker.title}»`}
            aria-pressed={playing}
            className="absolute inset-0 rounded-t-3xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <span
              className={cn(
                "absolute bottom-2 left-2 flex h-7 items-center gap-1.5 rounded-full pr-2.5 pl-1 text-[12px] font-semibold tabular-nums shadow-sm backdrop-blur transition-colors",
                playing ? "bg-sound text-white" : "bg-card/90 text-foreground ring-1 ring-border",
              )}
            >
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-full",
                  playing ? "bg-white/25" : "bg-foreground text-background",
                )}
                aria-hidden
              >
                {playing ? <PauseIcon className="size-3" weight="fill" /> : <PlayIcon className="size-3 translate-x-px" weight="fill" />}
              </span>
              {playing ? <Equalizer /> : null}
              {shortDuration(sticker.sound.durationSec)}
            </span>
          </button>
        ) : (
          <span
            className="pointer-events-none absolute bottom-2 left-2 grid size-7 place-items-center rounded-full bg-card/90 text-muted-foreground backdrop-blur"
            title="Sin sonido"
          >
            <VolumeXIcon className="size-3.5" />
            <span className="sr-only">Sin sonido</span>
          </span>
        )}
        {sticker.hidden && (
          <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-retro-a/90 px-2 py-0.5 text-[11px] font-medium text-black">
            En revisión
          </span>
        )}
        {rank !== undefined && (
          <span className="pointer-events-none absolute top-2 right-2.5 font-pixel text-[11px] text-muted-foreground">
            #{rank}
          </span>
        )}
      </div>

      <div className="space-y-2 p-3">
        <div className="min-w-0">
          <h3 className="truncate text-[14px] font-medium tracking-tight" title={sticker.title}>
            {sticker.title}
          </h3>
          {sticker.creator && (
            <Link
              href={creatorHref(sticker.creator.handle)}
              className="mt-1 flex w-fit max-w-full items-center gap-1.5 rounded-full text-[12px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <Avatar avatar={sticker.creator.avatar} size={18} />
              <span className="truncate">@{sticker.creator.handle}</span>
            </Link>
          )}
          {cat && (
            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
              {cat.emoji} {cat.label}
            </p>
          )}
          {(sticker.uses > 0 || sticker.saves > 0) && (
            <p className="mt-0.5 truncate text-[12px] text-muted-foreground tabular-nums">
              {[
                sticker.uses > 0 && countLabel(sticker.uses, "uso", "usos"),
                sticker.saves > 0 && countLabel(sticker.saves, "guardado", "guardados"),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        <SendToWhatsAppButton sticker={sticker} />
        <div className="flex items-center justify-between text-muted-foreground">
          <IconAction label={saved ? "Quitar de guardados" : "Guardar"} pressed={saved} onClick={toggleSaved}>
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
          <MoreMenu sticker={sticker} />
        </div>
      </div>
    </article>
  );
}

/** «2 s» / «1:05»: short enough for a phone card (the exact length is in the sound editor). */
const shortDuration = (sec: number) => (sec < 60 ? `${Math.max(1, Math.round(sec))} s` : formatTime(Math.round(sec)));

/** Three bouncing bars while it plays (CSS only; still when reduced motion is on). */
function Equalizer() {
  return (
    <span className="flex h-3 items-end gap-px" aria-hidden>
      {[0, 150, 300].map((d) => (
        <span
          key={d}
          className="w-0.5 origin-bottom animate-[eq_0.9s_ease-in-out_infinite] rounded-full bg-white motion-reduce:animate-none"
          style={{ animationDelay: `${d}ms`, height: "100%" }}
        />
      ))}
    </span>
  );
}

/** Less frequent actions: share, download, report (not on your own sticker). */
function MoreMenu({ sticker }: { sticker: CommunitySticker }) {
  const [reportOpen, setReportOpen] = useState(false);
  const me = useMe().data;
  const mine = Boolean(me && sticker.creator && me.handle === sticker.creator.handle);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Más opciones de «${sticker.title}»`}
            className="grid size-8 place-items-center rounded-full transition-colors hover:bg-muted hover:text-foreground"
          >
            <MoreHorizontalIcon className="size-[18px]" weight="bold" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => void shareLink(sticker.title, sticker.stickerUrl)}>
            <Share2Icon className="size-4" /> Compartir
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={downloadUrl(sticker.stickerUrl)}>
              <DownloadIcon className="size-4" /> Descargar
            </a>
          </DropdownMenuItem>
          {!mine && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setReportOpen(true)} className="text-destructive">
                <FlagIcon className="size-4" /> Reportar
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ReportDialog stickerId={sticker.id} title={sticker.title} open={reportOpen} onOpenChange={setReportOpen} />
    </>
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
        <div className="shimmer h-9 rounded-full bg-muted" />
        <div className="shimmer h-7 rounded-full bg-muted" />
      </div>
    </div>
  );
}
