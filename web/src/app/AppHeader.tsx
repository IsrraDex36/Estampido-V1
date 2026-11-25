import type { WhatsAppStatus } from "@contract";
import { AudioWaveformIcon } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { BotStatusPill } from "@/features/bot/BotStatusPill";

export function AppHeader({ bot }: { bot: WhatsAppStatus | null }) {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/75 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <AudioWaveformIcon className="size-4.5" />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="font-heading text-sm font-semibold tracking-tight">Sticker Video Audio</p>
          <p className="hidden truncate text-xs text-muted-foreground sm:block">Stickers con sonido para WhatsApp</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <BotStatusPill status={bot} />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
