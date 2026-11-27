import { useInfiniteQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { Link } from "wouter";
import { useShallow } from "zustand/react/shallow";
import { ROUTES } from "@/app/routes";
import { Mascot } from "@/components/pixel/Mascot";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { useMe } from "@/features/account/api";
import { LinkDialog } from "@/features/bot/LinkDialog";
import { socialQueries } from "@/features/social/api";
import { XIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useStickerFeed } from "../api/queries";
import { categoryById, FEED_SORTS, TOP_PERIODS } from "../model";
import { selectFilters, selectHasFilters, useCommunityStore } from "../store/communityStore";
import { InfiniteFooter } from "./InfiniteFooter";
import { StickerCard, StickerCardSkeleton } from "./StickerCard";
import { TrendingShelves } from "./TrendingShelves";

const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5 4xl:grid-cols-6 4xl:gap-4";

/** Paginated feed driven by the filters store (cursor pages, infinite scroll + «Cargar más»). */
export function Feed() {
  const filters = useCommunityStore(useShallow(selectFilters));
  // Typing shouldn't fire a request per key: the query follows a deferred copy.
  const query = useDeferredValue(filters.query);
  const personal = filters.sort === "siguiendo";
  // «Tendencias» with no category or search: grouped shelves instead of one endless wall.
  const grouped = filters.sort === "hot" && !filters.category && !query.trim();
  const me = useMe();
  const ranked = useStickerFeed({ ...filters, query }, !personal && !grouped);
  const followingFeed = useInfiniteQuery({ ...socialQueries.feed(), enabled: personal && Boolean(me.data) });
  const feed = personal ? followingFeed : ranked;
  const hasFilters = useCommunityStore(selectHasFilters);
  const reset = useCommunityStore((s) => s.reset);
  const toggleCategory = useCommunityStore((s) => s.toggleCategory);
  const setQuery = useCommunityStore((s) => s.setQuery);

  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const title =
    filters.sort === "top"
      ? `Top · ${TOP_PERIODS.find((p) => p.id === filters.period)?.label}`
      : (FEED_SORTS.find((s) => s.id === filters.sort)?.label ?? "");
  const cat = categoryById(filters.category);

  return (
    <Section index="01" title={title}>
      <div className="mb-4 space-y-2" aria-live="polite">
        {(cat || filters.query.trim()) && !personal && (
          <div className="flex flex-wrap items-center gap-2">
            {cat && (
              <FilterChip label={`${cat.emoji} ${cat.label}`} onRemove={() => toggleCategory(cat.id)} />
            )}
            {filters.query.trim() && <FilterChip label={`«${filters.query.trim()}»`} onRemove={() => setQuery("")} />}
            {hasFilters && (
              <button type="button" onClick={reset} className="h-9 rounded-full px-3 text-[13px] text-muted-foreground hover:text-foreground">
                Quitar todo
              </button>
            )}
          </div>
        )}
        <p className="text-[13px] text-muted-foreground">
          {personal
            ? "Lo nuevo de los creadores que sigues."
            : grouped
              ? "Lo que más suena, por categoría. Desliza cada fila o toca «Ver todo»."
              : "Toca un sticker para escucharlo. «Usar» lleva su sonido a tu clip."}
        </p>
      </div>

      {grouped ? (
        <TrendingShelves empty={<EmptyFeed filtered={false} onReset={reset} />} />
      ) : personal && !me.isPending && !me.data ? (
        <FollowingSignedOut />
      ) : feed.isPending ? (
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
        personal ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl bg-stage px-6 py-12 text-center">
            <Mascot size={84} />
            <p className="max-w-sm text-[14px] text-muted-foreground">
              Aún no sigues a nadie (o no han publicado). Encuentra creadores y toca «Seguir».
            </p>
            <Button asChild className="rounded-full">
              <Link href={`${ROUTES.community}?tab=creadores`}>Ver creadores</Link>
            </Button>
          </div>
        ) : (
          <EmptyFeed filtered={hasFilters} onReset={reset} />
        )
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

function FollowingSignedOut() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl bg-stage px-6 py-12 text-center">
      <Mascot size={84} />
      <p className="max-w-sm text-[14px] text-muted-foreground">Entra con tu WhatsApp para seguir creadores y ver aquí lo que publiquen.</p>
      <Button className="rounded-full" onClick={() => setOpen(true)}>
        Entrar con WhatsApp
      </Button>
      <LinkDialog open={open} onOpenChange={setOpen} />
    </div>
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

/** An active filter, removable in one tap (≥ 36 px tall, the ✕ is the whole chip). */
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Quitar filtro ${label}`}
      className="flex h-9 items-center gap-1.5 rounded-full bg-foreground pr-2.5 pl-3.5 text-[13px] font-medium text-background"
    >
      {label}
      <XIcon className="size-3.5" weight="bold" />
    </button>
  );
}
