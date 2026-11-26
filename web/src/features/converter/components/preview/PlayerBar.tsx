import { PauseIcon, PlayIcon } from "@/components/icons";
import { formatTime } from "@/lib/time";
import type { StickerPlayer } from "../../hooks/useStickerPlayer";
import { Equalizer } from "../ui/Waveform";

/** Play/pause + progress for the sticker's sound. */
export function PlayerBar({ player, fallbackDuration }: { player: StickerPlayer; fallbackDuration: number }) {
  if (!player.hasAudio) {
    return <p className="text-center text-[13px] text-muted-foreground">Este sticker no tiene sonido.</p>;
  }
  const total = player.duration || fallbackDuration;
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={player.toggle}
        aria-label={player.playing ? "Pausar" : player.status === "paused" ? "Continuar" : "Reproducir"}
        className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95"
      >
        {player.playing ? <PauseIcon className="size-4.5" weight="fill" /> : <PlayIcon className="size-4.5 translate-x-px" weight="fill" />}
      </button>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full origin-left rounded-full bg-sound transition-transform duration-200 ease-linear"
          style={{ transform: `scaleX(${player.progress})` }}
        />
      </div>
      <span className="flex w-20 items-center justify-end gap-2 font-mono text-[13px] tabular-nums text-muted-foreground">
        {player.playing && <Equalizer className="text-sound" />}
        {formatTime(player.progress * total)}
      </span>
    </div>
  );
}
