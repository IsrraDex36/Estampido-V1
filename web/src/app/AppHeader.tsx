import { AudioWaveformIcon } from "@/components/icons";
import { Link } from "wouter";
import { AppNav } from "./AppNav";
import { ROUTES } from "./routes";
import { ThemeToggle } from "@/components/theme-toggle";
import { BotStatus } from "@/features/bot/BotStatus";
import { TourButton } from "@/features/onboarding/TourButton";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-[1760px] items-center gap-3 px-5 sm:px-8 2xl:px-12">
        <Link href={ROUTES.create} className="flex items-center gap-3 rounded-lg" aria-label="Estampido, inicio">
          <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground" aria-hidden>
            <AudioWaveformIcon className="size-4" />
          </span>
          <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">Estampido</span>
        </Link>
        <AppNav className="ml-2 sm:ml-4" />
        <div className="ml-auto flex items-center gap-1.5">
          <BotStatus />
          <TourButton />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
