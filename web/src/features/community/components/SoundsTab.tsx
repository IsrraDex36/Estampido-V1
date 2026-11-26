import { useDeferredValue, useState } from "react";
import { SearchIcon, XIcon } from "@/components/icons";
import { Section } from "@/components/section";
import { cn } from "@/lib/utils";
import { useSoundFeed } from "../api/queries";
import { FEED_SORTS } from "../model";
import { InfiniteFooter } from "./InfiniteFooter";
import { SoundRow, SoundRowSkeleton } from "./SoundRow";

type Sort = (typeof FEED_SORTS)[number]["id"];
const MAX_QUERY = 80;

/** Every community sound: order, search, paginated (infinite + «Cargar más»). */
export function SoundsTab() {
  const [sort, setSort] = useState<Sort>("hot");
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim());
  const sounds = useSoundFeed({ sort, q });
  const items = sounds.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Section index="01" title="Sonidos">
      <p className="mb-4 text-[13px] text-muted-foreground">
        Escucha cualquiera y toca <b className="text-foreground">Usar</b> para llevarlo a tu video, GIF o foto.
      </p>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div role="tablist" aria-label="Orden de sonidos" className="inline-flex w-fit max-w-full overflow-x-auto rounded-full bg-muted/60 p-1">
          {FEED_SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={sort === s.id}
              onClick={() => setSort(s.id)}
              className={cn(
                "shrink-0 rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors",
                sort === s.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.id === "top" ? "Más usados" : s.label}
            </button>
          ))}
        </div>
        <label className="relative w-full min-w-0 sm:max-w-xs sm:flex-1">
          <span className="sr-only">Buscar sonidos</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            maxLength={MAX_QUERY}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar sonidos…"
            className="h-10 w-full rounded-full bg-muted/60 pr-9 pl-9 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {query && (
            <button
              type="button"
              aria-label="Borrar búsqueda"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          )}
        </label>
      </div>

      {sounds.isPending ? (
        <ul aria-busy="true">
          {["a", "b", "c", "d", "e"].map((k) => (
            <SoundRowSkeleton key={k} />
          ))}
        </ul>
      ) : items.length === 0 ? (
        <p className="rounded-2xl bg-stage px-4 py-10 text-center text-[13px] text-muted-foreground">
          {q ? `Nada con «${q}». Prueba otra palabra.` : "Aún no hay sonidos publicados."}
        </p>
      ) : (
        <>
          <ol className="space-y-0.5">
            {items.map((s, i) => (
              <SoundRow key={s.id} sound={s} rank={sort === "new" ? undefined : i + 1} />
            ))}
          </ol>
          <InfiniteFooter
            hasNext={Boolean(sounds.hasNextPage)}
            loading={sounds.isFetchingNextPage}
            error={sounds.isError}
            onMore={() => void sounds.fetchNextPage()}
            endLabel="No hay más sonidos."
          />
        </>
      )}
    </Section>
  );
}
