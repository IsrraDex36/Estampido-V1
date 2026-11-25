import { CollectionSection } from "@/features/collection/components/CollectionSection";
import { useCollectResults } from "@/features/collection/useCollectResults";
import { useCommunitySoundLink } from "./hooks/useCommunitySound";
import { useConvertShortcut } from "./hooks/useConvertShortcut";
import { ClipSection } from "./sections/ClipSection";
import { Hero } from "./sections/Hero";
import { ResultSection } from "./sections/ResultSection";
import { SettingsSection } from "./sections/SettingsSection";

/**
 * Layout only. Mobile: 1 column. lg: clip | settings on top, the result
 * full-width below (stage + details side by side), then the collection.
 */
export function ConverterPage() {
  useConvertShortcut();
  useCollectResults();
  useCommunitySoundLink();
  return (
    <>
      <Hero />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] 2xl:gap-6 3xl:gap-8">
        <ClipSection />
        <SettingsSection />
      </div>
      <ResultSection className="mt-5 scroll-mt-20 2xl:mt-6 3xl:mt-8" />
      <CollectionSection className="mt-5 2xl:mt-6" />
    </>
  );
}
