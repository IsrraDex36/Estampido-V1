import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useBotStatus, useLink } from "./api";
import { LinkDialog } from "./LinkDialog";

const COPY = {
  on: { label: "Bot conectado", hint: "Puedes enviar stickers directo a tu chat." },
  linking: { label: "Bot sin conexión", hint: "El bot corre pero no está conectado a WhatsApp." },
  off: { label: "Bot apagado", hint: "Ejecuta «npm run bot» para enviar desde aquí." },
} as const;

/** Header status: skeleton while the first check runs; click → manage the WhatsApp link. */
export function BotStatus({ alwaysLabel = false }: { alwaysLabel?: boolean } = {}) {
  const status = useBotStatus();
  const link = useLink();
  const [open, setOpen] = useState(false);
  if (status === undefined) return <Skeleton className="h-8 w-32 rounded-full" />;
  const state = status.connected ? "on" : status.available ? "linking" : "off";
  const phone = link.data?.state === "linked" ? link.data.phone : null;
  const label = state === "on" && phone ? `WhatsApp ${phone}` : COPY[state].label;
  const hint =
    state !== "on"
      ? COPY[state].hint
      : phone
        ? "Tus stickers llegan a ese chat. Toca para gestionar."
        : status.selfSend
          ? "Modo local: se envía a tu propio chat. Toca para vincular otro WhatsApp."
          : "Toca para vincular tu WhatsApp.";
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={state !== "on"}
            className="inline-flex h-8 max-w-full items-center gap-2 rounded-full bg-muted px-3 text-[13px] font-medium transition-colors hover:bg-muted/70 disabled:cursor-default"
          >
            <span
              role="status"
              aria-label={label}
              className={cn("size-2 rounded-full", state === "on" ? "bg-sound" : state === "linking" ? "bg-retro-a" : "bg-muted-foreground/40")}
            />
            <span className={alwaysLabel ? "truncate" : "hidden sm:inline"}>{label}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>{hint}</TooltipContent>
      </Tooltip>
      <LinkDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
