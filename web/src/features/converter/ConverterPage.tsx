import { CollectionSection } from "@/features/collection/components/CollectionSection";
import { useCollectResults } from "@/features/collection/useCollectResults";
import { useConvertShortcut } from "./hooks/useConvertShortcut";
import { ClipSection } from "./sections/ClipSection";
import { Hero } from "./sections/Hero";
import { ResultSection } from "./sections/ResultSection";
import { SettingsSection } from "./sections/SettingsSection";

/**
 * Layout only. Mobile: 1 column. lg: clip + settings | sticky result.
 * 2xl (≥1536): three columns. 3xl (≥1920, 27″): wider tracks and type.
 */
export function ConverterPage() {
  useConvertShortcut();
  useCollectResults();
  return (
    <>
      <Hero />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_27rem] 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_28rem] 2xl:gap-6 3xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_32rem] 3xl:gap-8">
        <ClipSection className="lg:col-start-1 lg:row-start-1" />
        <SettingsSection className="lg:col-start-1 lg:row-start-2 2xl:col-start-2 2xl:row-start-1" />
        <ResultSection className="scroll-mt-20 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 2xl:col-start-3 2xl:row-span-1" />
      </div>
      <CollectionSection className="mt-5 2xl:mt-6" />
    </>
  );
}
