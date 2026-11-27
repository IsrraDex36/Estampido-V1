import type { CommunitySticker } from "@contract";
import { useState } from "react";
import { Link } from "wouter";
import {
  BookmarkIcon,
  DownloadIcon,
  FlagIcon,
  MoreHorizontalIcon,
  PackIcon,
  Trash2Icon,
  PauseIcon,
  PlayIcon,
  Share2Icon,
  UseSoundIcon,
  Volume2Icon,
  VolumeXIcon,
} from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { DeleteStickerDialog } from "./DeleteStickerDialog";
import { ReportDialog } from "./ReportDialog";
import { AddToPackDialog } from "@/features/social/AddToPackDialog";
import { LinkDialog } from "@/features/bot/LinkDialog";
import { SendToWhatsAppButton } from "./SendToWhatsAppButton";

/** A published sticker: tap the cover to hear it; send it to WhatsApp, save, use its sound, share, download. */
export function StickerCard({
  sticker,
  rank,
  className,
  compact = false,
}: {
  sticker: CommunitySticker;
  rank?: number;
  className?: string;
  /** Shelf version: title + creator and one row of icon actions (a glance, not a wall). */
  compact?: boolean;
}) {
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
        // h-full: every card in a grid row is as tall as the tallest one.
        "group flex h-full flex-col overflow-hidden rounded-3xl bg-muted/40 ring-1 ring-border/60 transition-shadow hover:ring-foreground/20",
        className,
      )}
    >
      <div className="relative aspect-square bg-stage">
        <SyncedSticker
          src={sticker.stickerUrl}
          alt={sticker.title}
          mode={mode}
          getTime={() => (soundUrl ? previewTime(soundUrl) : 0)}
          className="size-full object-contain p-3"
        />
        {sticker.sound ? (
          // The whole cover plays (big, thumb-friendly target). Visible cues stay small and
          // in the corners: the length top-left, a round play button bottom-right.
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
                "absolute top-2 left-2 flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold tabular-nums backdrop-blur transition-colors",
                playing ? "bg-sound text-white" : "bg-black/55 text-white",
              )}
            >
              {playing ? <Equalizer /> : <Volume2Icon className="size-3" weight="fill" />}
              {shortDuration(sticker.sound.durationSec)}
            </span>
            <span
              className={cn(
                "absolute right-2 bottom-2 grid size-8 place-items-center rounded-full text-white shadow-sm backdrop-blur transition-transform group-hover:scale-105 active:scale-95",
                playing ? "bg-sound" : "bg-black/55",
              )}
              aria-hidden
            >
              {playing ? <PauseIcon className="size-3.5" weight="fill" /> : <PlayIcon className="size-3.5 translate-x-px" weight="fill" />}
            </span>
          </button>
        ) : (
          <span
            className="pointer-events-none absolute top-2 left-2 flex h-6 items-center gap-1 rounded-full bg-black/55 px-2 text-[11px] font-medium text-white backdrop-blur"
            title="Sin sonido"
          >
            <VolumeXIcon className="size-3" />
            <span className="sr-only">Sin sonido</span>
          </span>
        )}
        {sticker.hidden && (
          <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-retro-a/90 px-2 py-0.5 text-[11px] font-medium text-black">
            En revisión
          </span>
        )}
        {rank !== undefined && (
          <span className="pointer-events-none absolute top-2 right-2 grid h-6 min-w-6 place-items-center rounded-full bg-black/55 px-1.5 font-pixel text-[10px] text-white backdrop-blur">
            #{rank}
          </span>
        )}
      </div>

      {compact ? (
        <div className="flex flex-1 flex-col gap-2.5 p-2.5">
          <div className="min-w-0">
            <h3 className="truncate text-[13.5px] leading-5 font-semibold tracking-tight" title={sticker.title}>
              {sticker.title}
            </h3>
            {sticker.creator ? (
              <Link
                href={creatorHref(sticker.creator.handle)}
                className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <Avatar avatar={sticker.creator.avatar} size={14} />
                <span className="truncate">@{sticker.creator.handle}</span>
              </Link>
            ) : (
              <p className="text-[12px] text-muted-foreground">Comunidad</p>
            )}
          </div>
          <CardActions sticker={sticker} saved={saved} onToggleSaved={toggleSaved} compact />
        </div>
      ) : (
      /* Three fixed lines (title · who & what · numbers) and the actions pinned to
          the bottom: every card in a row lines up, whatever its text. */
      <div className="flex flex-1 flex-col gap-2.5 p-3">
        <div className="min-w-0 space-y-1">
          <h3 className="truncate text-[14px] leading-5 font-semibold tracking-tight" title={sticker.title}>
            {sticker.title}
          </h3>
          <p className="flex h-[18px] min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
            {sticker.creator ? (
              <Link
                href={creatorHref(sticker.creator.handle)}
                className="flex min-w-0 items-center gap-1.5 transition-colors hover:text-foreground"
              >
                <Avatar avatar={sticker.creator.avatar} size={16} />
                <span className="truncate">@{sticker.creator.handle}</span>
              </Link>
            ) : (
              <span className="truncate">Comunidad</span>
            )}
            {cat && (
              <span className="ml-auto shrink-0" title={cat.label} role="img" aria-label={cat.label}>
                {cat.emoji}
              </span>
            )}
          </p>
          <p className="h-[18px] truncate text-[12px] leading-[18px] text-muted-foreground/80 tabular-nums">
            {sticker.uses > 0 || sticker.saves > 0
              ? [
                  sticker.uses > 0 && countLabel(sticker.uses, "uso", "usos"),
                  sticker.saves > 0 && countLabel(sticker.saves, "guardado", "guardados"),
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Nuevo"}
          </p>
        </div>
        <CardActions sticker={sticker} saved={saved} onToggleSaved={toggleSaved} />
      </div>
      )}
    </article>
  );
}

/**
 * One clear primary action (send) and the supporting ones with VISIBLE labels
 * (unlabeled icons are guessed right ~1 in 3 times), each at least 44 px tall.
 */
function CardActions({
  sticker,
  saved,
  onToggleSaved,
  compact = false,
}: {
  sticker: CommunitySticker;
  saved: boolean;
  onToggleSaved: () => void;
  compact?: boolean;
}) {
  return (
    <div className="mt-auto space-y-1">
      <SendToWhatsAppButton sticker={sticker} short={compact} className="h-10" />
      <div className={cn("grid text-muted-foreground", sticker.sound ? "grid-cols-3" : "grid-cols-2")}>
        <LabeledAction label={saved ? "Guardado" : "Guardar"} pressed={saved} onClick={onToggleSaved}>
          <BookmarkIcon className={cn("size-[18px]", saved && "text-foreground")} weight={saved ? "fill" : "bold"} />
        </LabeledAction>
        {sticker.sound && (
          <Link
            href={remixHref(sticker.id)}
            aria-label="Usar este sonido en mi clip"
            className={ACTION}
          >
            <UseSoundIcon className="size-[18px] text-sound" weight="duotone" />
            <span className="text-[11px] font-medium">Usar</span>
          </Link>
        )}
        <MoreMenu sticker={sticker} labeled />
      </div>
    </div>
  );
}

const ACTION =
  "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none";

function LabeledAction({
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
    <button type="button" aria-pressed={pressed} onClick={onClick} className={ACTION}>
      {children}
      <span className={cn("text-[11px] font-medium", pressed && "text-foreground")}>{label}</span>
    </button>
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
function MoreMenu({ sticker, labeled = false }: { sticker: CommunitySticker; labeled?: boolean }) {
  const [reportOpen, setReportOpen] = useState(false);
  const [packOpen, setPackOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const meQuery = useMe();
  const me = meQuery.data;
  // Only «signed out» once we know: while the session loads, the pack dialog opens (it asks if needed).
  const signedOut = !meQuery.isPending && !me;
  const mine = Boolean(me && sticker.creator && me.handle === sticker.creator.handle);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {labeled ? (
            <button type="button" aria-label={`Más opciones de «${sticker.title}»`} className={ACTION}>
              <MoreHorizontalIcon className="size-[18px]" weight="bold" />
              <span className="text-[11px] font-medium">Más</span>
            </button>
          ) : (
            <button
              type="button"
              aria-label={`Más opciones de «${sticker.title}»`}
              className="grid size-10 place-items-center rounded-full transition-colors hover:bg-muted hover:text-foreground"
            >
              <MoreHorizontalIcon className="size-[18px]" weight="bold" />
            </button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => (signedOut ? setLinkOpen(true) : setPackOpen(true))}>
            <PackIcon className="size-4" /> Agregar a pack
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void shareLink(sticker.title, sticker.stickerUrl)}>
            <Share2Icon className="size-4" /> Compartir
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={downloadUrl(sticker.stickerUrl)}>
              <DownloadIcon className="size-4" /> Descargar
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* Yours → delete it; someone else's → report it. Never both. */}
          {mine ? (
            <DropdownMenuItem onSelect={() => setDeleteOpen(true)} className="text-destructive">
              <Trash2Icon className="size-4" /> Eliminar
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setReportOpen(true)} className="text-destructive">
              <FlagIcon className="size-4" /> Reportar
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {mine ? (
        <DeleteStickerDialog sticker={sticker} open={deleteOpen} onOpenChange={setDeleteOpen} />
      ) : (
        <ReportDialog stickerId={sticker.id} title={sticker.title} open={reportOpen} onOpenChange={setReportOpen} />
      )}
      {!signedOut && <AddToPackDialog stickerId={sticker.id} title={sticker.title} open={packOpen} onOpenChange={setPackOpen} />}
      {signedOut && linkOpen && <LinkDialog open={linkOpen} onOpenChange={setLinkOpen} />}
    </>
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
