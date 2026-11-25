import { CalendarClockIcon, TrophyIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { GhostBlock, GhostFrame, SoonBadge } from "./Ghost";

/** Weekly challenge as a wide banner: theme + deadline + entries + participate. */
export function ChallengeBanner() {
  return (
    <section
      aria-labelledby="challenge-title"
      className="surface relative overflow-hidden p-5 sm:p-6 2xl:p-7"
    >
      <div
        className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-retro-a/15 blur-3xl"
        aria-hidden
      />
      <div className="relative grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)_auto]">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-retro-a/15 text-retro-a">
            <TrophyIcon className="size-6" weight="duotone" />
          </span>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="challenge-title" className="text-xl font-semibold tracking-tight">
                Reto semanal
              </h2>
              <SoonBadge phase={4} />
            </div>
            <GhostBlock className="h-3 w-56 max-w-full" />
            <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <CalendarClockIcon className="size-3.5" /> Cierra en – días · – participantes
            </p>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-2" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <GhostFrame key={i} className="aspect-square" />
          ))}
        </div>
        <Button disabled className="h-11 rounded-full px-6" title="Pronto">
          Participar
        </Button>
      </div>
    </section>
  );
}
