import { PlusIcon, SearchIcon, UploadIcon } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/app/routes";
import { SoonBadge } from "./Ghost";

export function CommunityHero() {
  return (
    <section className="flex flex-col gap-6 pt-10 pb-8 sm:pt-14 lg:flex-row lg:items-end lg:justify-between 2xl:pt-16">
      <div className="max-w-2xl">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-foreground px-3 py-1 font-pixel text-[10px] text-background">
          COMUNIDAD
        </p>
        <h1 className="display text-5xl sm:text-6xl 2xl:text-7xl">Lo que suena en el chat.</h1>
        <p className="mt-4 max-w-xl text-[17px] text-muted-foreground">
          Descubre, vota y comparte stickers con sonido hechos por la comunidad. Sube los tuyos y escala en el ranking.
        </p>
        <div className="mt-4">
          <SoonBadge />
        </div>
      </div>
      <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:flex-col xl:flex-row">
        <label className="relative flex-1 lg:w-80">
          <span className="sr-only">Buscar stickers</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            disabled
            placeholder="Buscar stickers, sonidos, @creadores…"
            className="h-11 w-full rounded-full bg-muted/60 pr-4 pl-10 text-[14px] placeholder:text-muted-foreground/70 disabled:cursor-not-allowed"
          />
        </label>
        <div className="flex gap-2">
          <Button disabled className="h-11 flex-1 rounded-full px-5 font-semibold sm:flex-none" title="Pronto">
            <UploadIcon data-icon="inline-start" />
            Publicar
          </Button>
          <Button asChild variant="secondary" className="h-11 flex-1 rounded-full px-5 sm:flex-none">
            <Link href={ROUTES.create}>
              <PlusIcon data-icon="inline-start" />
              Crear sticker
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
