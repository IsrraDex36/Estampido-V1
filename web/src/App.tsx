import { Toaster } from "@/components/ui/sonner";
import { ConverterPage } from "@/features/converter/ConverterPage";

export default function App() {
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          <span className="text-2xl" aria-hidden>
            🔊
          </span>
          <div>
            <h1 className="font-heading text-lg font-semibold">Sticker Video Audio</h1>
            <p className="text-sm text-muted-foreground">Video → sticker WebP animado + audio para WhatsApp</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <ConverterPage />
      </main>
      <Toaster richColors position="top-center" />
    </div>
  );
}
