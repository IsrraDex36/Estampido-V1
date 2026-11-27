import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSelfStore } from "@/features/self/selfStore";
import { WhatsAppIcon } from "@/components/icons";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { useBotStatus } from "./api";

/**
 * Header status of «tu propio WhatsApp»: linked (stickers go to your «Tú»
 * chat) or not yet (tap to link — that also signs you in). «En pausa» only
 * when the WhatsApp service itself is down.
 */
export function BotStatus({ alwaysLabel = false, compact = false }: { alwaysLabel?: boolean; compact?: boolean } = {}) {
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
  const dot = state === "on" ? "bg-sound" : state === "idle" ? "bg-retro-a" : "bg-muted-foreground/40";
  if (compact) {
    // Phones: an icon with a status dot. Tap = link (when not linked) or say what it means
    // (no hover tooltips on touch).
    return (
      <button
        type="button"
        aria-label={label}
        onClick={() => (state === "idle" ? openDialog() : notify.info(hint, { id: "wa-status" }))}
        className="relative grid size-9 place-items-center rounded-full bg-muted transition-colors active:bg-muted/70"
      >
        <WhatsAppIcon className="size-[18px]" />
        <span className={cn("absolute right-1.5 top-1.5 size-2.5 rounded-full ring-2 ring-background", dot, state === "idle" && "animate-pulse")} />
      </button>
    );
  }
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
            className={cn("size-2 rounded-full", dot)}
          />
          <span className={alwaysLabel ? "truncate" : "hidden sm:inline"}>{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}
