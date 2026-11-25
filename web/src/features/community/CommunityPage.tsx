import { Section } from "@/components/section";
import { ChallengeBanner } from "./components/ChallengeBanner";
import { CommunityHero } from "./components/CommunityHero";
import { CreatorsList } from "./components/Creators";
import { Feed } from "./components/Feed";
import { FeedToolbar } from "./components/FeedToolbar";
import { SoonBadge } from "./components/Ghost";
import { MySpace } from "./components/MySpace";
import { PacksRail } from "./components/PacksRail";
import { Ranking } from "./components/Ranking";
import { TrendingSounds } from "./components/TrendingSounds";
import { PHASE } from "./model";
import { useFiltersUrlSync } from "./store/useFiltersUrlSync";

/**
 * Community: hero → sticky filters → feed (paginated) | (ranking, viral sounds)
 * → my space | creators → weekly challenge → packs. Challenge, packs and
 * creators are still placeholders (phase 4).
 */
export default function CommunityPage() {
  useFiltersUrlSync();
  return (
    <>
      <CommunityHero />
      <FeedToolbar />

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] 2xl:gap-6 3xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Feed />
        <div className="grid gap-5 sm:grid-cols-2 lg:sticky lg:top-36 lg:grid-cols-1 2xl:gap-6">
          <Section index="02" title="Top de la semana">
            <Ranking />
          </Section>
          <Section index="03" title="Sonidos virales">
            <TrendingSounds />
          </Section>
        </div>
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] 2xl:mt-6 2xl:gap-6 3xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Section index="04" title="Tu espacio">
          <MySpace />
        </Section>
        <Section index="05" title="Creadores" aside={<SoonBadge phase={PHASE.social} />}>
          <CreatorsList />
        </Section>
      </div>

      <div className="mt-5 2xl:mt-6">
        <ChallengeBanner />
      </div>

      <Section index="06" title="Packs de la comunidad" aside={<SoonBadge phase={PHASE.social} />} className="mt-5 2xl:mt-6">
        <PacksRail />
      </Section>
    </>
  );
}
