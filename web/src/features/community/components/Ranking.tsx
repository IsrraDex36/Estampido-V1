import type { CommunitySticker } from "@contract";
import { countLabel } from "@/lib/format";
import { SendToWhatsAppButton } from "./SendToWhatsAppButton";
import { cn } from "@/lib/utils";
import { useRanking } from "../api/queries";
import { trackPlay } from "../plays";
import { previewTime, usePreview, usePreviewMode } from "../store/previewStore";
import { SyncedSticker } from "@/components/SyncedSticker";

const MEDAL = ["bg-[#f5c542] text-black", "bg-[#cfd3da] text-black", "bg-[#d99a5b] text-black"] as const;

/**
 * Top of the week by engagement (reuses, saves, sends, listens — see the
 * server's TRENDING_WEIGHTS), as one clear ranked list: position (medals for
 * 1–3), the sticker (tap to listen), who made it, its numbers in words, send.
 */
export function Ranking() {
  const ranking = useRanking();
  const items = ranking.data ?? [];

  if (ranking.isPending) {
    return (
      <div className="space-y-2" aria-busy="true">
        {["a", "b", "c", "d", "e"].map((k) => (
          <div key={k} className="shimmer h-16 rounded-2xl bg-muted" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return <p className="rounded-2xl bg-stage px-4 py-8 text-center text-[13px] text-muted-foreground">Aún no hay ranking esta semana.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-muted-foreground">Lo más usado, guardado y enviado en los últimos 7 días. Toca uno para escucharlo.</p>
      <ol className="space-y-1.5">
        {items.map((s, i) => (
          <li
            key={s.id}
            className={cn("flex items-center gap-3 rounded-2xl p-2 pr-2.5", i < 3 ? "bg-muted/50 ring-1 ring-border/60" : "hover:bg-muted/40")}
          >
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full font-pixel text-[10px] tabular-nums",
                MEDAL[i] ?? "text-muted-foreground",
              )}
              aria-label={`Puesto ${i + 1}`}
            >
              {i + 1}
            </span>
            <Thumb sticker={s} className={cn("shrink-0 rounded-xl", i < 3 ? "size-14" : "size-11")} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold leading-5">{s.title}</p>
              {s.creator && <p className="truncate text-[12px] text-muted-foreground">@{s.creator.handle}</p>}
              <Signals sticker={s} />
            </div>
            <SendToWhatsAppButton sticker={s} compact className="size-10 shrink-0" />
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The numbers people recognize, in words (no unexplained icons). */
function Signals({ sticker }: { sticker: CommunitySticker }) {
  const parts = [
    sticker.uses > 0 && countLabel(sticker.uses, "uso", "usos"),
    sticker.saves > 0 && countLabel(sticker.saves, "guardado", "guardados"),
  ].filter(Boolean);
  return <p className="truncate text-[11.5px] text-muted-foreground/80 tabular-nums">{parts.length ? parts.join(" · ") : "Nuevo"}</p>;
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
