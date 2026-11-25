import { AudioWaveformIcon } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { BotStatus } from "@/features/bot/BotStatus";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-[1760px] items-center gap-3 px-5 sm:px-8 2xl:px-12">
        <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground" aria-hidden>
          <AudioWaveformIcon className="size-4" />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">Sticker Video Audio</span>
        <div className="ml-auto flex items-center gap-1.5">
          <BotStatus />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
