import type { CommunitySticker } from "@contract";
import { BookmarkIcon, VoteIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useRanking } from "../api/queries";
import { trackPlay } from "../plays";
import { previewTime, usePreview, usePreviewMode } from "../store/previewStore";
import { SyncedSticker } from "@/components/SyncedSticker";

const PODIUM = [
  { place: 2, height: "h-16", tint: "bg-foreground/10" },
  { place: 1, height: "h-24", tint: "bg-sound/25" },
  { place: 3, height: "h-11", tint: "bg-retro-a/20" },
] as const;

/**
 * Top of the week by engagement (reuses, saves, sends, listens — see the
 * server's TRENDING_WEIGHTS): podium (1–3) + list (4–10). Tap to listen.
 */
export function Ranking() {
  const ranking = useRanking();
  const items = ranking.data ?? [];

  if (ranking.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="shimmer h-40 rounded-2xl bg-muted" />
        {["a", "b", "c", "d"].map((k) => (
          <div key={k} className="shimmer h-9 rounded-xl bg-muted" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return <p className="rounded-2xl bg-stage px-4 py-8 text-center text-[13px] text-muted-foreground">Aún no hay ranking esta semana.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 items-end gap-2">
        {PODIUM.map(({ place, height, tint }) => {
          const s = items[place - 1];
          return (
            <div key={place} className="flex min-w-0 flex-col items-center gap-2">
              {s ? <Thumb sticker={s} className="w-full max-w-24" /> : <div className="aspect-square w-full max-w-24 rounded-2xl border border-dashed border-foreground/15" />}
              <p className="w-full truncate text-center text-[11px] text-muted-foreground">{s?.title ?? "—"}</p>
              <div className={`grid w-full place-items-center rounded-t-xl ${height} ${tint}`}>
                <span className="font-pixel text-sm text-foreground/70">{place}</span>
              </div>
            </div>
          );
        })}
      </div>
      {items.length > 3 && (
        <ol className="space-y-1" start={4}>
          {items.slice(3).map((s, i) => (
            <li key={s.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
              <span className="w-6 font-pixel text-[11px] text-muted-foreground">{i + 4}</span>
              <Thumb sticker={s} className="size-9 shrink-0 rounded-lg" />
              <span className="min-w-0 flex-1 truncate text-[13px]">{s.title}</span>
              <Signals sticker={s} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** The two signals people recognize: reuses of its sound and saves. */
function Signals({ sticker }: { sticker: CommunitySticker }) {
  return (
    <span
      className="flex items-center gap-2 font-mono text-[12px] text-muted-foreground tabular-nums"
      title={`${sticker.uses} usos de su sonido · ${sticker.saves} guardados`}
    >
      <span className="flex items-center gap-0.5">
        <VoteIcon className="size-3.5" /> {sticker.uses}
      </span>
      <span className="flex items-center gap-0.5">
        <BookmarkIcon className="size-3.5" /> {sticker.saves}
      </span>
    </span>
  );
}

function Thumb({ sticker, className }: { sticker: CommunitySticker; className?: string }) {
  const soundUrl = sticker.sound?.url ?? null;
  const mode = usePreviewMode(soundUrl);
  const playing = mode === "playing";
  const toggle = usePreview((s) => s.toggle);
  return (
    <button
      type="button"
      disabled={!sticker.sound}
      onClick={() => {
        if (!sticker.sound) return;
        if (mode === "idle") trackPlay(sticker.id);
        toggle(sticker.sound.url);
      }}
      aria-label={`Escuchar «${sticker.title}»`}
      aria-pressed={playing}
      className={cn(
        "grid aspect-square place-items-center overflow-hidden rounded-2xl bg-stage transition-shadow disabled:cursor-default",
        mode !== "idle" && "ring-2 ring-sound",
        mode === "paused" && "ring-sound/50",
        className,
      )}
    >
      <SyncedSticker
        src={sticker.stickerUrl}
        alt=""
        mode={mode}
        getTime={() => (soundUrl ? previewTime(soundUrl) : 0)}
        className="size-full object-contain p-1.5"
      />
    </button>
  );
}
