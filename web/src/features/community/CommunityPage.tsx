import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { ChallengeBanner } from "./components/ChallengeBanner";
import { CommunityHero } from "./components/CommunityHero";
import { CreatorsList } from "./components/Creators";
import { FeedToolbar } from "./components/FeedToolbar";
import { SoonBadge } from "./components/Ghost";
import { MySpace } from "./components/MySpace";
import { PacksRail } from "./components/PacksRail";
import { Ranking } from "./components/Ranking";
import { StickerCardPlaceholder } from "./components/StickerCard";
import { TrendingSounds } from "./components/TrendingSounds";
import { categoryById, FEED_SORTS, PHASE, TOP_PERIODS } from "./model";
import { selectHasFilters, useCommunityStore } from "./store/communityStore";
import { useFiltersUrlSync } from "./store/useFiltersUrlSync";

const FEED_SLOTS = 12;

/**
 * Community (phase 0): every section in place, no data yet.
 * hero → sticky filters → feed | (ranking, viral sounds) → weekly challenge
 * → packs → my space | creators.
 */
export default function CommunityPage() {
  useFiltersUrlSync();
  return (
    <>
      <CommunityHero />
      <FeedToolbar />

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] 2xl:gap-6 3xl:grid-cols-[minmax(0,1fr)_26rem]">
        <FeedSection />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1 2xl:gap-6">
          <Section index="02" title="Ranking" aside={<SoonBadge phase={PHASE.ranking} />}>
            <Ranking />
          </Section>
          <Section index="03" title="Sonidos virales" aside={<SoonBadge phase={PHASE.social} />}>
            <TrendingSounds />
          </Section>
        </div>
      </div>

      <div className="mt-5 2xl:mt-6">
        <ChallengeBanner />
      </div>

      <Section index="04" title="Packs de la comunidad" aside={<SoonBadge phase={PHASE.social} />} className="mt-5 2xl:mt-6">
        <PacksRail />
      </Section>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] 2xl:mt-6 2xl:gap-6 3xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Section index="05" title="Tu espacio" aside={<SoonBadge phase={PHASE.publish} />}>
          <MySpace />
        </Section>
        <Section index="06" title="Creadores" aside={<SoonBadge phase={PHASE.social} />}>
          <CreatorsList />
        </Section>
      </div>
    </>
  );
}

/** Feed title and hint follow the filters (atomic selectors: re-renders only on what it reads). */
function FeedSection() {
  const sort = useCommunityStore((s) => s.sort);
  const period = useCommunityStore((s) => s.period);
  const category = useCommunityStore((s) => s.category);
  const query = useCommunityStore((s) => s.query.trim());
  const hasFilters = useCommunityStore(selectHasFilters);
  const reset = useCommunityStore((s) => s.reset);

  const sortLabel = FEED_SORTS.find((s) => s.id === sort)?.label ?? "";
  const title = sort === "top" ? `Top · ${TOP_PERIODS.find((p) => p.id === period)?.label}` : sortLabel;
  const cat = categoryById(category);
  const scope = [cat && `${cat.emoji} ${cat.label}`, query && `«${query}»`].filter(Boolean).join(" · ");

  return (
    <Section index="01" title={title} aside={<SoonBadge phase={PHASE.feed} />}>
      <div className="mb-4 flex min-h-8 flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground" aria-live="polite">
          {scope ? `Filtrando por ${scope}. ` : ""}Aquí verás los stickers de la comunidad; pasa el cursor para escucharlos.
        </p>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="rounded-full" onClick={reset}>
            Limpiar filtros
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5">
        {Array.from({ length: FEED_SLOTS }, (_, i) => (
          <StickerCardPlaceholder
            key={`slot-${i + 1}`}
            rank={sort === "top" ? i + 1 : undefined}
            // phones: 6 slots are enough to read the layout
            className={i >= 6 ? "hidden sm:flex" : undefined}
          />
        ))}
      </div>
    </Section>
  );
}
