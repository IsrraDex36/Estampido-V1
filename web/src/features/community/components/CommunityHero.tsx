import { DownloadIcon, PlusIcon, SoundLibraryIcon } from "@/components/icons";
import { Link } from "wouter";
import { ROUTES } from "@/app/routes";
import { Button } from "@/components/ui/button";
import { compactNumber, exactNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCommunityStats } from "../api/queries";
import { CommunityRulesButton } from "./CommunityRules";

const STATS = [
  { key: "stickers", label: "Stickers", icon: <span aria-hidden>🔊</span>, tone: "text-foreground" },
  { key: "sounds", label: "Sonidos", icon: <SoundLibraryIcon className="size-4" />, tone: "text-sound" },
  { key: "downloads", label: "Descargas", hint: "Veces que alguien se llevó un sticker de la comunidad a su WhatsApp", icon: <DownloadIcon className="size-4" />, tone: "text-retro-a" },
] as const;

/** How the community works, in three steps (the «world» of the app at a glance). */
const STEPS = [
  { n: 1, text: "Escucha y guarda los que te gusten" },
  { n: 2, text: "«Usar» lleva su sonido a tu propio clip" },
  { n: 3, text: "Envíalo a WhatsApp o publícalo aquí" },
] as const;

/** Compact header: what this is, the numbers that prove it's alive, how it works, the rules. */
export function CommunityHero() {
  const stats = useCommunityStats();
  return (
    <section className="space-y-5 pt-8 pb-4 sm:pt-12 2xl:pt-14">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0 max-w-2xl">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-foreground px-3 py-1 font-pixel text-[10px] text-background">
            COMUNIDAD
          </p>
          <h1 className="display text-4xl sm:text-6xl 2xl:text-7xl">Lo que suena en el chat.</h1>
          <p className="mt-3 max-w-xl text-[15px] text-muted-foreground sm:text-[17px]">
            Stickers con sonido hechos por la comunidad. Escúchalos, mándalos a tu WhatsApp o usa su sonido en tu propio
            clip.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button asChild className="h-11 rounded-full px-5 font-semibold">
              <Link href={ROUTES.create}>
                <PlusIcon data-icon="inline-start" />
                Crear y publicar
              </Link>
            </Button>
            <CommunityRulesButton className="h-11 rounded-full px-4 text-muted-foreground" />
          </div>
        </div>

        {/* Numbers: always compact (370 k, 1.2 M) so they never break their card. */}
        <dl className="grid grid-cols-3 gap-2 sm:gap-3 lg:w-[26rem] 3xl:w-[30rem]">
          {STATS.map((s) => {
            const value = stats.data?.[s.key];
            return (
              <div
                key={s.key}
                className="min-w-0 rounded-2xl bg-muted/50 px-3 py-3 sm:p-4"
                title={"hint" in s ? s.hint : undefined}
              >
                <dt className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
                  <span className={cn("shrink-0", s.tone)}>{s.icon}</span>
                  <span className="truncate">{s.label}</span>
                </dt>
                <dd
                  className={cn("display mt-1 truncate text-2xl tabular-nums sm:text-3xl", s.tone)}
                  title={value !== undefined ? exactNumber(value) : undefined}
                >
                  {value !== undefined ? (
                    compactNumber(value)
                  ) : (
                    <span className="shimmer inline-block h-7 w-10 rounded-md bg-muted align-middle" />
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>

      {/* Phones: a short vertical list (nothing hidden off-screen); wider: one row. */}
      <ol className="grid gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
        {STEPS.map((s) => (
          <li
            key={s.n}
            className="flex min-w-0 items-center gap-2 rounded-full bg-muted/40 py-1.5 pr-3.5 pl-1.5 text-[13px] ring-1 ring-border/60"
          >
            <span className="grid size-6 place-items-center rounded-full bg-foreground font-pixel text-[10px] text-background">
              {s.n}
            </span>
            {s.text}
          </li>
        ))}
      </ol>
    </section>
  );
}
