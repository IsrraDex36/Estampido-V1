import type { CommunitySound } from "@contract";
import { Link } from "wouter";
import { BookmarkIcon, Loader2Icon, PauseIcon, PlayIcon, UseSoundIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { remixHref } from "@/app/routes";
import { countLabel } from "@/lib/format";
import { formatTime } from "@/lib/time";

/** «2 s» / «1:05» (the same short form as the sticker cards). */
const shortDuration = (sec: number) => (sec < 60 ? `${Math.max(1, Math.round(sec))} s` : formatTime(Math.round(sec)));
import { cn } from "@/lib/utils";
import { useToggleFavorite } from "@/features/account/api";
import { trackPlay } from "../plays";
import { useFavorites } from "../store/favoritesStore";
import { usePreview } from "../store/previewStore";

/** Deterministic bars from the id (decorative, stable across renders). */
function bars(id: string, n = 24): number[] {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return Array.from({ length: n }, (_, i) => {
    h = (h * 1103515245 + 12345) >>> 0;
    const env = Math.sin((Math.PI * (i + 1)) / (n + 1));
    return 0.2 + 0.8 * env * ((h % 1000) / 1000);
  });
}

/**
 * A reusable sound: play, save, use. «Usar» is a link to Crear (/?sonido=id)
 * unless `onUse` is given (the picker inside Crear).
 */
export function SoundRow({
  sound,
  rank,
  onUse,
  using,
  compact = false,
}: {
  sound: CommunitySound;
  rank?: number;
  onUse?: (sound: CommunitySound) => void;
  using?: boolean;
  /** Narrow places (sidebar): icon-only «Usar». */
  compact?: boolean;
}) {
  const playing = usePreview((s) => s.playing === sound.url);
  const toggle = usePreview((s) => s.toggle);
  const saved = useFavorites((s) => sound.id in s.sounds);
  const toggleFavorite = useToggleFavorite();
  const toggleSaved = () => toggleFavorite("sound", sound);

  return (
    <li className="flex items-center gap-2 rounded-2xl px-1 py-2 transition-colors hover:bg-muted/50 sm:gap-3 sm:px-2">
      {rank !== undefined && (
        <span className="w-3.5 shrink-0 text-center font-pixel text-[10px] text-muted-foreground sm:w-4 sm:text-[11px]">{rank}</span>
      )}
      <button
        type="button"
        onClick={() => {
          if (!playing) trackPlay(sound.id);
          toggle(sound.url);
        }}
        aria-label={playing ? `Pausar «${sound.title}»` : `Escuchar «${sound.title}»`}
        aria-pressed={playing}
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-full transition-colors",
          playing ? "bg-sound text-white" : "bg-foreground text-background hover:opacity-90",
        )}
      >
        {playing ? <PauseIcon className="size-4" weight="fill" /> : <PlayIcon className="size-4 translate-x-px" weight="fill" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{sound.title}</p>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          {/* Decorative wave: only where there's room (phones keep the numbers readable). */}
          <div className="hidden h-3.5 min-w-0 flex-1 items-center gap-[2px] overflow-hidden sm:flex" aria-hidden>
            {bars(sound.id).map((h, i) => (
              <span
                key={`${sound.id}-${i.toString()}`}
                className={cn("w-[3px] shrink-0 rounded-full", playing ? "bg-sound" : "bg-sound/40")}
                style={{ height: `${Math.round(h * 100)}%` }}
              />
            ))}
          </div>
          <span className="min-w-0 truncate text-[12px] text-muted-foreground tabular-nums sm:shrink-0 sm:font-mono sm:text-[11px]">
            {shortDuration(sound.durationSec)}
            {sound.uses > 0 ? ` · ${countLabel(sound.uses, "uso", "usos")}` : ""}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={toggleSaved}
        aria-label={saved ? "Quitar de sonidos guardados" : "Guardar sonido"}
        aria-pressed={saved}
        className="flex size-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl text-muted-foreground sm:w-auto sm:min-w-14 sm:px-1.5 transition-colors hover:bg-muted hover:text-foreground"
      >
        <BookmarkIcon className={cn("size-[18px]", saved && "text-foreground")} weight={saved ? "fill" : "bold"} />
        {/* Phones: the row is tight and the bookmark is a well-known icon; the label from tablets up. */}
        <span className={cn("hidden text-[10.5px] font-medium sm:block", saved && "text-foreground")}>
          {saved ? "Guardado" : "Guardar"}
        </span>
      </button>
      {onUse ? (
        <Button size="sm" className="shrink-0 rounded-full" disabled={using} onClick={() => onUse(sound)}>
          {using ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <UseSoundIcon data-icon="inline-start" />}
          Usar
        </Button>
      ) : (
        <Button
          asChild
          size={compact ? "icon" : "sm"}
          variant="secondary"
          className={cn("shrink-0 rounded-full max-sm:h-10 max-sm:px-3", compact && "size-8")}
        >
          <Link href={remixHref(sound.id)} aria-label={`Usar «${sound.title}» en mi clip`} title="Usar en mi clip">
            <UseSoundIcon data-icon={compact ? undefined : "inline-start"} className={compact ? "size-4 text-sound" : undefined} />
            {!compact && "Usar"}
          </Link>
        </Button>
      )}
    </li>
  );
}

export function SoundRowSkeleton() {
  return (
    <li className="flex items-center gap-3 px-2 py-2" aria-hidden>
      <div className="shimmer size-9 shrink-0 rounded-full bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="shimmer h-3 w-2/3 rounded-full bg-muted" />
        <div className="shimmer h-2.5 rounded-full bg-muted" />
      </div>
      <div className="shimmer h-8 w-16 rounded-full bg-muted" />
    </li>
  );
}
