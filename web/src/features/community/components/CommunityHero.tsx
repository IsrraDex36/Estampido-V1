import { PlusIcon, UploadIcon } from "@/components/icons";
import { Link } from "wouter";
import { ROUTES } from "@/app/routes";
import { Button } from "@/components/ui/button";

const STATS = [
  { label: "Stickers", tone: "text-foreground" },
  { label: "Creadores", tone: "text-sound" },
  { label: "Envíos al chat", tone: "text-retro-a" },
] as const;

export function CommunityHero() {
  return (
    <section className="grid gap-8 pt-10 pb-6 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end 2xl:pt-16">
      <div className="max-w-2xl">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-foreground px-3 py-1 font-pixel text-[10px] text-background">
          COMUNIDAD · PRONTO
        </p>
        <h1 className="display text-5xl sm:text-6xl 2xl:text-7xl">Lo que suena en el chat.</h1>
        <p className="mt-4 max-w-xl text-[17px] text-muted-foreground">
          Descubre, vota y comparte stickers con sonido hechos por la comunidad. Sube los tuyos y escala en el ranking.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button disabled className="h-11 rounded-full px-5 font-semibold" title="Pronto">
            <UploadIcon data-icon="inline-start" />
            Publicar
          </Button>
          <Button asChild variant="secondary" className="h-11 rounded-full px-5">
            <Link href={ROUTES.create}>
              <PlusIcon data-icon="inline-start" />
              Crear sticker
            </Link>
          </Button>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2 sm:gap-3 lg:w-[26rem] 3xl:w-[30rem]">
        {STATS.map((s) => (
          <div key={s.label} className="rounded-2xl bg-muted/50 p-4">
            <dd className={`display text-3xl tabular-nums ${s.tone}`}>–</dd>
            <dt className="mt-1 text-[12px] text-muted-foreground">{s.label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}
