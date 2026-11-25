import { useDeferredValue } from "react";
import { Link } from "wouter";
import { useShallow } from "zustand/react/shallow";
import { ROUTES } from "@/app/routes";
import { Mascot } from "@/components/pixel/Mascot";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useStickerFeed } from "../api/queries";
import { categoryById, FEED_SORTS, TOP_PERIODS } from "../model";
import { selectFilters, selectHasFilters, useCommunityStore } from "../store/communityStore";
import { InfiniteFooter } from "./InfiniteFooter";
import { StickerCard, StickerCardSkeleton } from "./StickerCard";

const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5";

/** Paginated feed driven by the filters store (cursor pages, infinite scroll + «Cargar más»). */
export function Feed() {
  const filters = useCommunityStore(useShallow(selectFilters));
  // Typing shouldn't fire a request per key: the query follows a deferred copy.
  const query = useDeferredValue(filters.query);
  const feed = useStickerFeed({ ...filters, query });
  const hasFilters = useCommunityStore(selectHasFilters);
  const reset = useCommunityStore((s) => s.reset);

  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const title =
    filters.sort === "top"
      ? `Top · ${TOP_PERIODS.find((p) => p.id === filters.period)?.label}`
      : (FEED_SORTS.find((s) => s.id === filters.sort)?.label ?? "");
  const cat = categoryById(filters.category);
  const scope = [cat && `${cat.emoji} ${cat.label}`, filters.query.trim() && `«${filters.query.trim()}»`]
    .filter(Boolean)
    .join(" · ");

  return (
    <Section index="01" title={title}>
      <div className="mb-4 flex min-h-8 flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground" aria-live="polite">
          {scope ? `Filtrando por ${scope}. ` : ""}Toca un sticker para escucharlo; «Usar» lleva su sonido a tu clip.
        </p>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="rounded-full" onClick={reset}>
            Limpiar filtros
          </Button>
        )}
      </div>

      {feed.isPending ? (
        <div className={GRID} aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => `sk${i}`).map((k) => (
            <StickerCardSkeleton key={k} />
          ))}
        </div>
      ) : feed.isError && items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-stage px-6 py-12 text-center">
          <p className="text-[14px]">No se pudo cargar la comunidad.</p>
          <Button variant="secondary" className="rounded-full" onClick={() => void feed.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyFeed filtered={hasFilters} onReset={reset} />
      ) : (
        <>
          <div className={cn(GRID, "transition-opacity", feed.isPlaceholderData && "opacity-50")}>
            {items.map((s, i) => (
              <StickerCard key={s.id} sticker={s} rank={filters.sort === "top" ? i + 1 : undefined} />
            ))}
            {feed.isFetchingNextPage &&
              ["a", "b", "c", "d"].map((k) => <StickerCardSkeleton key={`more-${k}`} />)}
          </div>
          <InfiniteFooter
            hasNext={feed.hasNextPage}
            loading={feed.isFetchingNextPage}
            error={feed.isFetchNextPageError}
            onMore={() => void feed.fetchNextPage()}
            endLabel={`${items.length} ${items.length === 1 ? "sticker" : "stickers"} · no hay más.`}
          />
        </>
      )}
    </Section>
  );
}

function EmptyFeed({ filtered, onReset }: { filtered: boolean; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl bg-stage px-6 py-12 text-center">
      <Mascot size={84} />
      <p className="font-pixel text-[11px] text-muted-foreground">{filtered ? "NADA POR AQUÍ" : "SILENCIO TOTAL"}</p>
      <p className="max-w-sm text-[14px] text-muted-foreground">
        {filtered
          ? "No hay stickers con esos filtros. Prueba otra categoría o búsqueda."
          : "Aún no hay stickers en la comunidad. Crea uno y toca «Publicar» para ser el primero."}
      </p>
      {filtered ? (
        <Button variant="secondary" className="rounded-full" onClick={onReset}>
          Limpiar filtros
        </Button>
      ) : (
        <Button asChild className="rounded-full">
          <Link href={ROUTES.create}>Crear y publicar</Link>
        </Button>
      )}
    </div>
  );
}
