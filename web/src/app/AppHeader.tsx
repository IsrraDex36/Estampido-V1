import { Mascot } from "@/components/pixel/Mascot";
import { ThemeToggle } from "@/components/theme-toggle";
import { BotStatus } from "@/features/bot/BotStatus";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-[1760px] items-center gap-3 px-5 sm:px-8 2xl:px-12">
        <Mascot size={30} still />
        <span className="text-[15px] font-semibold tracking-tight">Estampido</span>
        <div className="ml-auto flex items-center gap-1.5">
          <BotStatus />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
