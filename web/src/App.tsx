import { AppHeader } from "@/app/AppHeader";
import { Providers } from "@/app/providers";
import { useBotPolling } from "@/features/bot/botStore";
import { ConverterPage } from "@/features/converter/ConverterPage";

function Shell() {
  useBotPolling();
  return (
    <div className="min-h-svh bg-background text-foreground">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1760px] px-5 pb-16 sm:px-8 2xl:px-12">
        <ConverterPage />
      </main>
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
