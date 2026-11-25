import { useState } from "react";
import { Section } from "@/components/section";
import { CommunityHero } from "./components/CommunityHero";
import { FeedToolbar } from "./components/FeedToolbar";
import { SoonBadge } from "./components/Ghost";
import { MySpace } from "./components/MySpace";
import { PacksRail } from "./components/PacksRail";
import { Ranking } from "./components/Ranking";
import { ChallengeCard, CreatorsList } from "./components/SideCards";
import { StickerCardPlaceholder } from "./components/StickerCard";
import { FEED_SORTS, type FeedSort, PHASE, TOP_PERIODS, type TopPeriod } from "./model";

const FEED_SLOTS = 12;

/**
 * Community (phase 0): every section in place with placeholders, no data.
 * Layout: hero → toolbar → feed | sidebar (ranking, challenge) → packs → my space | creators.
 */
export default function CommunityPage() {
  const [sort, setSort] = useState<FeedSort>("hot");
  const [period, setPeriod] = useState<TopPeriod>("week");
  const [category, setCategory] = useState<string | null>(null);
  const sortLabel = FEED_SORTS.find((s) => s.id === sort)?.label ?? "";
  const periodLabel = TOP_PERIODS.find((p) => p.id === period)?.label ?? "";

  return (
    <>
      <CommunityHero />
      <FeedToolbar
        sort={sort}
        period={period}
        category={category}
        onSort={setSort}
        onPeriod={setPeriod}
        onCategory={setCategory}
      />

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] 2xl:gap-6 3xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Section
          index="01"
          title={sort === "top" ? `Top · ${periodLabel}` : sortLabel}
          aside={<SoonBadge phase={PHASE.feed} />}
        >
          <p className="mb-4 text-[13px] text-muted-foreground">
            {category ? `Categoría: ${category}. ` : ""}Aquí verás los stickers de la comunidad. Pasa el cursor para
            escucharlos.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5">
            {Array.from({ length: FEED_SLOTS }, (_, i) => (
              <StickerCardPlaceholder
                key={i}
                rank={sort === "top" ? i + 1 : undefined}
                // phones: 6 slots are enough to read the layout
                className={i >= 6 ? "hidden sm:flex" : undefined}
              />
            ))}
          </div>
        </Section>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1 2xl:gap-6">
          <Section index="02" title="Ranking" aside={<SoonBadge phase={PHASE.ranking} />}>
            <Ranking />
          </Section>
          <Section index="03" title="Reto semanal" aside={<SoonBadge phase={PHASE.social} />}>
            <ChallengeCard />
          </Section>
        </div>
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
