import type { WhatsAppStatus } from "@contract";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Compact header indicator: bot connected / off / checking. */
export function BotStatusPill({ status }: { status: WhatsAppStatus | null }) {
  const state = status === null ? "checking" : status.connected ? "on" : status.available ? "linking" : "off";
  const label = { checking: "Comprobando bot", on: "Bot conectado", linking: "Bot sin conexión", off: "Bot apagado" }[state];
  const hint = {
    checking: "Consultando al bot…",
    on: "Puedes enviar los stickers directo a tu chat.",
    linking: "El bot está corriendo pero no conectado a WhatsApp.",
    off: "Ejecuta «npm run bot» para enviar a WhatsApp desde aquí.",
  }[state];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="status"
          className="inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs font-medium backdrop-blur"
        >
          <span className="relative flex size-2">
            {state === "on" && (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
            )}
            <span
              className={cn(
                "relative inline-flex size-2 rounded-full",
                state === "on" && "bg-primary",
                state === "linking" && "bg-amber-500",
                state === "off" && "bg-muted-foreground/50",
                state === "checking" && "animate-pulse bg-muted-foreground/40",
              )}
            />
          </span>
          <span className="hidden sm:inline">{label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}
