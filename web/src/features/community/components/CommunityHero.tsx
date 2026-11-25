import { PlusIcon } from "@/components/icons";
import { Link } from "wouter";
import { ROUTES } from "@/app/routes";
import { Button } from "@/components/ui/button";
import { useCommunityStats } from "../data/queries";

const STATS = [
  { key: "stickers", label: "Stickers", tone: "text-foreground" },
  { key: "sounds", label: "Sonidos", tone: "text-sound" },
  { key: "uses", label: "Sonidos reutilizados", tone: "text-retro-a" },
] as const;

export function CommunityHero() {
  const stats = useCommunityStats();
  return (
    <section className="grid gap-8 pt-10 pb-6 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end 2xl:pt-16">
      <div className="max-w-2xl">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-foreground px-3 py-1 font-pixel text-[10px] text-background">
          COMUNIDAD
        </p>
        <h1 className="display text-5xl sm:text-6xl 2xl:text-7xl">Lo que suena en el chat.</h1>
        <p className="mt-4 max-w-xl text-[17px] text-muted-foreground">
          Escucha, guarda y comparte stickers con sonido. Usa cualquier sonido de la comunidad en tu propio video, GIF o foto.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild className="h-11 rounded-full px-5 font-semibold">
            <Link href={ROUTES.create}>
              <PlusIcon data-icon="inline-start" />
              Crear y publicar
            </Link>
          </Button>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2 sm:gap-3 lg:w-[26rem] 3xl:w-[30rem]">
        {STATS.map((s) => (
          <div key={s.label} className="rounded-2xl bg-muted/50 p-4">
            <dd className={`display text-3xl tabular-nums ${s.tone}`}>
              {stats.data ? stats.data[s.key].toLocaleString("es") : <span className="shimmer inline-block h-7 w-10 rounded-md bg-muted align-middle" />}
            </dd>
            <dt className="mt-1 text-[12px] text-muted-foreground">{s.label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}
