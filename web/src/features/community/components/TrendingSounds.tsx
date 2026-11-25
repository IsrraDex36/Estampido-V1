import { Button } from "@/components/ui/button";
import { useSoundFeed } from "../data/queries";
import { SoundRow, SoundRowSkeleton } from "./SoundRow";

const PARAMS = { sort: "top", q: "", limit: 5 } as const;

/** Most-reused sounds; «Ver más» pages through the rest (manual: it's a sidebar). */
export function TrendingSounds() {
  const sounds = useSoundFeed(PARAMS);
  const items = sounds.data?.pages.flatMap((p) => p.items) ?? [];

  if (sounds.isPending) {
    return (
      <ul aria-busy="true">
        {["a", "b", "c"].map((k) => (
          <SoundRowSkeleton key={k} />
        ))}
      </ul>
    );
  }
  if (items.length === 0) {
    return (
      <p className="rounded-2xl bg-stage px-4 py-8 text-center text-[13px] text-muted-foreground">
        Cuando se publiquen stickers con sonido, aparecerán aquí para usarlos en tus clips.
      </p>
    );
  }
  return (
    <div>
      <ol className="space-y-0.5">
        {items.map((s, i) => (
          <SoundRow key={s.id} sound={s} rank={i + 1} compact />
        ))}
        {sounds.isFetchingNextPage && <SoundRowSkeleton />}
      </ol>
      {sounds.hasNextPage && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full rounded-full"
          disabled={sounds.isFetchingNextPage}
          onClick={() => void sounds.fetchNextPage()}
        >
          Ver más sonidos
        </Button>
      )}
    </div>
  );
}
