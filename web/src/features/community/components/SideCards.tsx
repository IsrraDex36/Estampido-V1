import { CalendarClockIcon, TrophyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GhostBlock, GhostFrame } from "./Ghost";

/** Weekly challenge: theme, closing date, entries. */
export function ChallengeCard() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-retro-a/15 text-retro-a">
          <TrophyIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <GhostBlock className="h-3 w-3/4" />
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <CalendarClockIcon className="size-3.5" /> Cierra en – días
          </p>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <GhostFrame key={i} className="aspect-square" />
        ))}
      </div>
      <Button disabled variant="secondary" className="h-10 w-full rounded-full" title="Pronto">
        Participar
      </Button>
    </div>
  );
}

/** Featured creators. */
export function CreatorsList() {
  return (
    <ul className="space-y-1">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex items-center gap-3 rounded-xl px-2 py-2">
          <GhostFrame className="size-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <GhostBlock className="h-2.5 w-24" />
            <GhostBlock className="h-2 w-16" />
          </div>
          <Button disabled size="sm" variant="ghost" className="rounded-full" title="Pronto">
            Seguir
          </Button>
        </li>
      ))}
    </ul>
  );
}
