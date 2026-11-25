import { GhostBlock } from "./Ghost";

/** Community packs: 2×2 preview + name + author + count. */
export function PacksRail() {
  return (
    <div className="-mx-5 flex snap-x gap-4 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <article key={i} className="w-60 shrink-0 snap-start rounded-3xl bg-muted/40 p-3 ring-1 ring-border/60 sm:w-auto">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-stage p-3" aria-hidden>
            {[0, 1, 2, 3].map((j) => (
              <div key={j} className="aspect-square rounded-xl border border-dashed border-foreground/15" />
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 px-1">
            <div className="space-y-1.5">
              <GhostBlock className="h-3 w-24" />
              <GhostBlock className="h-2 w-16" />
            </div>
            <span className="font-mono text-[12px] text-muted-foreground">– stickers</span>
          </div>
        </article>
      ))}
    </div>
  );
}
