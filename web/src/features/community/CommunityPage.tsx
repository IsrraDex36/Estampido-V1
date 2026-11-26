import type { ReactNode } from "react";
import { BookmarkIcon, SoundLibraryIcon, CommunityIcon } from "@/components/icons";
import { Section } from "@/components/section";
import { cn } from "@/lib/utils";
import { CommunityHero } from "./components/CommunityHero";
import { CreatorsTab } from "./components/Creators";
import { Feed } from "./components/Feed";
import { FeedToolbar } from "./components/FeedToolbar";
import { MySpace } from "./components/MySpace";
import { Ranking } from "./components/Ranking";
import { SoundsTab } from "./components/SoundsTab";
import { type CommunityTab, useCommunityTab } from "./store/useCommunityTab";
import { useFiltersUrlSync } from "./store/useFiltersUrlSync";

const TABS: { id: CommunityTab; label: string; icon: ReactNode }[] = [
  { id: "stickers", label: "Stickers", icon: <span aria-hidden>🔊</span> },
  { id: "sonidos", label: "Sonidos", icon: <SoundLibraryIcon className="size-4" /> },
  { id: "creadores", label: "Creadores", icon: <CommunityIcon className="size-4" /> },
  { id: "espacio", label: "Tu espacio", icon: <BookmarkIcon className="size-4" /> },
];

/**
 * Community: a compact header (what it is, live numbers, how it works,
 * rules), then four tabs so each thing has its own calm space:
 * Stickers (feed + top of the week) · Sonidos · Creadores · Tu espacio.
 * The open tab is in the URL (?tab=…): shareable, back button works.
 */
export default function CommunityPage() {
  useFiltersUrlSync();
  const [tab, setTab] = useCommunityTab();

  return (
    <>
      <CommunityHero />
      <nav
        aria-label="Secciones de la comunidad"
        className="sticky top-14 z-20 -mx-5 bg-background/85 px-5 py-2 backdrop-blur-xl sm:-mx-8 sm:px-8 2xl:-mx-12 2xl:px-12"
      >
        <div role="tablist" className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => {
                setTab(t.id);
                window.scrollTo({ top: Math.min(window.scrollY, document.getElementById("community-tabs-top")?.offsetTop ?? 0) });
              }}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors sm:px-4 sm:text-[14px] [&>svg]:hidden sm:[&>svg]:block [&>span]:hidden sm:[&>span]:inline",
                tab === t.id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      <div id="community-tabs-top" />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-3">
        {tab === "stickers" && (
          <>
            <FeedToolbar />
            <div className="mt-4 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] 2xl:gap-6 3xl:grid-cols-[minmax(0,1fr)_26rem]">
              <Feed />
              <div className="lg:sticky lg:top-32">
                <Section index="02" title="Top de la semana">
                  <Ranking />
                </Section>
              </div>
            </div>
          </>
        )}
        {tab === "sonidos" && <SoundsTab />}
        {tab === "creadores" && <CreatorsTab />}
        {tab === "espacio" && (
          <Section index="01" title="Tu espacio">
            <MySpace />
          </Section>
        )}
      </div>
    </>
  );
}
