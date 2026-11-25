import { GhostBlock, GhostFrame } from "./Ghost";

const PODIUM = [
  { place: 2, height: "h-20", tint: "bg-foreground/10" },
  { place: 1, height: "h-28", tint: "bg-sound/25" },
  { place: 3, height: "h-14", tint: "bg-retro-a/20" },
] as const;

/** Top 3 podium + places 4–10 for the selected period. */
export function Ranking() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 items-end gap-2" aria-hidden>
        {PODIUM.map(({ place, height, tint }) => (
          <div key={place} className="flex flex-col items-center gap-2">
            <div className="grid aspect-square w-full max-w-24 place-items-center rounded-2xl border border-dashed border-foreground/15 bg-stage">
              <span className="font-pixel text-[10px] text-muted-foreground">?</span>
            </div>
            <GhostBlock className="h-2 w-12" />
            <div className={`grid w-full place-items-center rounded-t-xl ${height} ${tint}`}>
              <span className="font-pixel text-sm text-foreground/70">{place}</span>
            </div>
          </div>
        ))}
      </div>
      <ol className="space-y-1" aria-label="Puestos 4 a 10">
        {[4, 5, 6, 7, 8, 9, 10].map((n) => (
          <li key={n} className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="w-6 font-pixel text-[11px] text-muted-foreground">{n}</span>
            <GhostFrame className="size-9 shrink-0 rounded-lg" />
            <GhostBlock className="h-2.5 flex-1" />
            <span className="font-mono text-[12px] text-muted-foreground tabular-nums">▲ –</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
