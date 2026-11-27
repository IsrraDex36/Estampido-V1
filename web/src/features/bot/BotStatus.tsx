import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSelfStore } from "@/features/self/selfStore";
import { cn } from "@/lib/utils";
import { useBotStatus } from "./api";

/**
 * Header status of «tu propio WhatsApp»: linked (stickers go to your «Tú»
 * chat) or not yet (tap to link — that also signs you in). «En pausa» only
 * when the WhatsApp service itself is down.
 */
export function BotStatus({ alwaysLabel = false }: { alwaysLabel?: boolean } = {}) {
  const status = useBotStatus();
  const linked = useSelfStore((s) => s.session !== null);
  const openDialog = useSelfStore((s) => s.openDialog);
  if (status === undefined) return <Skeleton className="h-8 w-32 rounded-full" />;
  const state = !status.available ? "off" : linked ? "on" : "idle";
  const label = state === "on" ? "WhatsApp vinculado" : state === "idle" ? "Vincular WhatsApp" : "WhatsApp en pausa";
  const hint =
    state === "on"
      ? "Tus stickers llegan a tu chat «Tú». Para quitarlo: WhatsApp → Dispositivos vinculados."
      : state === "idle"
        ? "Vincula tu WhatsApp una vez: te mandas los stickers con sonido y entras a tu cuenta."
        : "El envío a WhatsApp vuelve en unos minutos. Mientras, puedes crear y descargar tus stickers.";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => openDialog()}
          disabled={state !== "idle"}
          className="inline-flex h-8 max-w-full items-center gap-2 rounded-full bg-muted px-3 text-[13px] font-medium transition-colors hover:bg-muted/70 disabled:cursor-default"
        >
          <span
            role="status"
            aria-label={label}
            className={cn("size-2 rounded-full", state === "on" ? "bg-sound" : state === "idle" ? "bg-retro-a" : "bg-muted-foreground/40")}
          />
          <span className={alwaysLabel ? "truncate" : "hidden sm:inline"}>{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}
