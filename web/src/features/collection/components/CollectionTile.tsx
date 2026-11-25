import { CheckIcon, Volume2Icon, VolumeXIcon } from "@/components/icons";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { CollectionItem } from "../collectionStore";

/** One sticker of the session; tap toggles selection. */
export function CollectionTile({
  item,
  selected,
  disabled,
  onToggle,
}: {
  item: CollectionItem;
  selected: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`Sticker ${item.soundSec ? `con sonido de ${formatTime(item.soundSec)}` : "sin sonido"}${selected ? ", seleccionado" : ""}`}
      className={cn(
        "group relative aspect-square overflow-hidden rounded-2xl bg-stage p-2 transition-[box-shadow,transform] active:scale-[0.97]",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        selected ? "shadow-[inset_0_0_0_2px_var(--foreground)]" : "hover:shadow-[inset_0_0_0_1px_var(--border)]",
      )}
    >
      <img src={item.stickerUrl} alt="" loading="lazy" className="size-full object-contain" />
      <span
        className={cn(
          "absolute top-2 left-2 grid size-5 place-items-center rounded-full border transition-colors",
          selected ? "border-foreground bg-foreground text-background" : "border-foreground/25 bg-card/80",
        )}
        aria-hidden
      >
        {selected && <CheckIcon className="size-3.5" weight="bold" />}
      </span>
      <span
        className={cn(
          "absolute right-2 bottom-2 flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[11px] tabular-nums",
          item.soundSec ? "bg-sound text-white" : "bg-card/90 text-muted-foreground",
        )}
      >
        {item.soundSec ? (
          <>
            <Volume2Icon className="size-3" weight="fill" />
            {formatTime(item.soundSec)}
          </>
        ) : (
          <>
            <VolumeXIcon className="size-3" />
            mudo
          </>
        )}
      </span>
    </button>
  );
}
