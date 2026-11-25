import { AppHeader } from "@/app/AppHeader";
import { Providers } from "@/app/providers";
import { useBotStatus } from "@/features/bot/useBotStatus";
import { ConverterPage } from "@/features/converter/ConverterPage";

function Shell() {
  const { status, refresh } = useBotStatus();
  return (
    <div className="relative min-h-svh bg-background">
      <div className="hero-glow pointer-events-none absolute inset-x-0 top-0 h-72" aria-hidden />
      <AppHeader bot={status} />
      <main className="relative mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <ConverterPage bot={status} onRefreshBot={() => void refresh()} />
      </main>
      <footer className="relative mx-auto max-w-6xl px-4 pb-8 text-xs text-muted-foreground">
        Hecho para pruebas locales · los archivos se borran a los 30 min.
      </footer>
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
