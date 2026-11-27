import type { CommunitySticker } from "@contract";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { communityQueries } from "../api/queries";
import { categoryById } from "../model";
import { useCommunityStore } from "../store/communityStore";
import { StickerCard, StickerCardSkeleton } from "./StickerCard";

/** Categories shown before «Ver más categorías» (a calm first screen, not a wall). */
export const FIRST_SHELVES = 4;

/**
 * «Tendencias» as browsable shelves: what's hot right now, then one row per
 * category (busiest first). Each row is a short horizontal strip — swipe on
 * phones, arrows on desktop — with «Ver todo» to open the full category.
 */
export function TrendingShelves({ empty }: { empty: ReactNode }) {
  const trending = useQuery(communityQueries.trending());
  const toggleCategory = useCommunityStore((s) => s.toggleCategory);
  const setSort = useCommunityStore((s) => s.setSort);
  const [expanded, setExpanded] = useState(false);

  if (trending.isPending) return <ShelvesSkeleton />;
  if (trending.isError || !trending.data) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl bg-stage px-6 py-12 text-center">
        <p className="text-[14px]">No se pudieron cargar las tendencias.</p>
        <Button variant="secondary" className="rounded-full" onClick={() => void trending.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }
  const { hot, shelves } = trending.data;
  const recent = trending.data.recent ?? [];
  if (hot.length === 0) return <>{empty}</>;
  const visible = expanded ? shelves : shelves.slice(0, FIRST_SHELVES);
  const hidden = shelves.length - visible.length;

  return (
    <div className="space-y-8 sm:space-y-10">
      <Shelf
        title="Lo más sonado ahora"
        icon="🔥"
        subtitle="Lo que más se escucha esta semana"
        items={hot}
        ranked
      />
      {recent.length > 0 && (
        <Shelf
          title="Recién agregados"
          icon="✨"
          subtitle="Lo último publicado"
          items={recent}
          action={
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 rounded-full text-[13px]"
              onClick={() => {
                setSort("new");
                document.getElementById("community-tabs-top")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Ver todo
              <ChevronRightIcon className="size-3.5" />
            </Button>
          }
        />
      )}
      {visible.map((s) => {
        const cat = categoryById(s.category);
        if (!cat) return null;
        return (
          <Shelf
            key={s.category}
            title={cat.label}
            icon={cat.emoji}
            items={s.items}
            action={
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 rounded-full text-[13px]"
                onClick={() => {
                  toggleCategory(s.category);
                  document.getElementById("community-tabs-top")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Ver todo
                <ChevronRightIcon className="size-3.5" />
              </Button>
            }
          />
        );
      })}
      {hidden > 0 && (
        <div className="flex justify-center">
          <Button variant="secondary" className="rounded-full" onClick={() => setExpanded(true)}>
            Ver más categorías ({hidden})
          </Button>
        </div>
      )}
    </div>
  );
}

function Shelf({
  title,
  icon,
  subtitle,
  items,
  action,
  ranked = false,
}: {
  title: string;
  icon: string;
  subtitle?: string;
  items: CommunitySticker[];
  action?: ReactNode;
  ranked?: boolean;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => strip.current?.scrollBy({ left: dir * strip.current.clientWidth * 0.85, behavior: "smooth" });
  return (
    <section aria-label={title} className="[content-visibility:auto] [contain-intrinsic-size:auto_420px]">
      <header className="mb-3 flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted/70 text-[18px]" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[16px] font-semibold tracking-tight sm:text-[17px]">{title}</h3>
          {subtitle && <p className="truncate text-[12.5px] text-muted-foreground">{subtitle}</p>}
        </div>
        {items.length > 3 && (
          <div className="hidden gap-1 md:flex">
            <Button variant="ghost" size="icon" className="size-8 rounded-full" aria-label={`Anteriores de ${title}`} onClick={() => scroll(-1)}>
              <ChevronLeftIcon className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-8 rounded-full" aria-label={`Siguientes de ${title}`} onClick={() => scroll(1)}>
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        )}
        {action}
      </header>
      <div
        ref={strip}
        className={cn(
          // Full-bleed strip on phones (cards peek past the edge = «swipe me»), snap per card.
          "-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 pb-2 sm:-mx-0 sm:scroll-px-0 sm:px-0",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {items.map((s, i) => (
          <StickerCard
            key={s.id}
            sticker={s}
            rank={ranked ? i + 1 : undefined}
            compact
            className="w-[40vw] max-w-[11.5rem] shrink-0 snap-start sm:w-[11rem] xl:w-[11.5rem] 4xl:w-[12.5rem] 4xl:max-w-[12.5rem]"
          />
        ))}
      </div>
    </section>
  );
}

function ShelvesSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true">
      {["a", "b", "c"].map((k) => (
        <div key={k}>
          <div className="mb-3 flex items-center gap-3">
            <div className="shimmer size-9 rounded-xl bg-muted" />
            <div className="shimmer h-4 w-40 rounded-full bg-muted" />
          </div>
          <div className="-mx-5 flex gap-3 overflow-hidden px-5 sm:mx-0 sm:px-0">
            {[1, 2, 3, 4, 5].map((i) => (
              <StickerCardSkeleton key={i} className="w-[40vw] max-w-[11.5rem] shrink-0 sm:w-[11rem] xl:w-[11.5rem] 4xl:w-[12.5rem] 4xl:max-w-[12.5rem]" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
