import { AppFooter } from "@/app/AppFooter";
import { AppHeader } from "@/app/AppHeader";
import { Providers } from "@/app/providers";
import { PixelBackground } from "@/components/pixel/PixelBackground";
import { useBotPolling } from "@/features/bot/botStore";
import { ConverterPage } from "@/features/converter/ConverterPage";

function Shell() {
  useBotPolling();
  return (
    // isolate: own stacking context so the -z-10 backdrop sits above our bg.
    <div className="relative isolate min-h-svh overflow-x-clip bg-background text-foreground">
      <PixelBackground />
      <AppHeader />
      <main className="mx-auto w-full max-w-[1760px] px-5 sm:px-8 2xl:px-12">
        <ConverterPage />
      </main>
      <AppFooter />
    </div>
  );
}

export default function App() {
  return (
    <Providers>
      <Shell />
    </Providers>
  );
}
