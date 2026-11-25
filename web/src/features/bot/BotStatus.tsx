import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useBotStore } from "./botStore";

const COPY = {
  on: { label: "Bot conectado", hint: "Puedes enviar stickers directo a tu chat." },
  linking: { label: "Bot sin conexión", hint: "El bot corre pero no está conectado a WhatsApp." },
  off: { label: "Bot apagado", hint: "Ejecuta «npm run bot» para enviar desde aquí." },
} as const;

/** Header status: skeleton while the first check runs. */
export function BotStatus() {
  const status = useBotStore((s) => s.status);
  if (status === null) return <Skeleton className="h-8 w-32 rounded-full" />;
  const state = status.connected ? "on" : status.available ? "linking" : "off";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="status" className="inline-flex h-8 items-center gap-2 rounded-full bg-muted px-3 text-[13px] font-medium">
          <span className={cn("size-2 rounded-full", state === "on" ? "bg-sound" : state === "linking" ? "bg-retro-a" : "bg-muted-foreground/40")} />
          <span className="hidden sm:inline">{COPY[state].label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{COPY[state].hint}</TooltipContent>
    </Tooltip>
  );
}
