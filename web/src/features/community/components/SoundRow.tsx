import type { CommunitySound } from "@contract";
import { Link } from "wouter";
import { BookmarkIcon, Loader2Icon, PauseIcon, PlayIcon, UseSoundIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { remixHref } from "@/app/routes";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
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
  const toggleSaved = useFavorites((s) => s.toggleSound);

  return (
    <li className="flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-muted/50">
      {rank !== undefined && <span className="w-4 shrink-0 font-pixel text-[11px] text-muted-foreground">{rank}</span>}
      <button
        type="button"
        onClick={() => toggle(sound.url)}
        aria-label={playing ? `Pausar «${sound.title}»` : `Escuchar «${sound.title}»`}
        aria-pressed={playing}
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full transition-colors",
          playing ? "bg-sound text-white" : "bg-foreground text-background hover:opacity-90",
        )}
      >
        {playing ? <PauseIcon className="size-4" weight="fill" /> : <PlayIcon className="size-4 translate-x-px" weight="fill" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{sound.title}</p>
        <div className="mt-1 flex items-center gap-2">
          <div className="flex h-3.5 min-w-0 flex-1 items-center gap-[2px] overflow-hidden" aria-hidden>
            {bars(sound.id).map((h, i) => (
              <span
                key={`${sound.id}-${i.toString()}`}
                className={cn("w-[3px] shrink-0 rounded-full", playing ? "bg-sound" : "bg-sound/40")}
                style={{ height: `${Math.round(h * 100)}%` }}
              />
            ))}
          </div>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
            {formatTime(sound.durationSec)}
            {sound.uses > 0 ? ` · ${sound.uses} ${sound.uses === 1 ? "uso" : "usos"}` : ""}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => toggleSaved(sound)}
        aria-label={saved ? "Quitar de sonidos guardados" : "Guardar sonido"}
        aria-pressed={saved}
        className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <BookmarkIcon className={cn("size-4", saved && "text-foreground")} weight={saved ? "fill" : "bold"} />
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
          className={cn("shrink-0 rounded-full", compact && "size-8")}
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
