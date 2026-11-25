import { Loader2Icon, SendIcon, Trash2Icon } from "@/components/icons";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useBotStatus, useRefreshBot } from "@/features/bot/api";
import { Section } from "@/components/section";
import { selectSelectedItems, useCollectionStore } from "../collectionStore";
import { useBatchSend } from "../useBatchSend";
import { CollectionTile } from "./CollectionTile";
import { notify } from "@/lib/notify";

/** Session collection: pick several stickers and send them all at once. */
export function CollectionSection({ className }: { className?: string }) {
  const { items, selected, toggle, selectAll, clearSelection, remove } = useCollectionStore(
    useShallow((s) => ({
      items: s.items,
      selected: s.selected,
      toggle: s.toggle,
      selectAll: s.selectAll,
      clearSelection: s.clearSelection,
      remove: s.remove,
    })),
  );
  const selectedItems = useCollectionStore(useShallow(selectSelectedItems));
  const bot = useBotStatus();
  const refreshBot = useRefreshBot();
  const { phase, send, cancel, reset } = useBatchSend();

  if (items.length === 0) return null;
  const sending = phase.kind === "sending";
  const ready = bot?.connected === true;
  const count = selectedItems.length;

  const onSend = async () => {
    const result = await send(selectedItems.map((i) => i.id));
    if (result.kind !== "finished") return;
    if (result.stoppedReason && result.sent === 0) notify.error(result.stoppedReason);
    else if (result.failed || result.stoppedReason) {
      notify.warning(`Enviados ${result.sent} de ${result.total}.${result.stoppedReason ? ` ${result.stoppedReason}` : ""}`);
    } else notify.success(result.sent === 1 ? "Sticker enviado a tu chat" : `${result.sent} stickers enviados a tu chat`);
    if (result.stoppedReason) void refreshBot();
    reset();
  };

  const sendButton = (
    <Button className="h-11 rounded-full px-5 font-semibold" disabled={!ready || count === 0 || sending} onClick={onSend}>
      <SendIcon data-icon="inline-start" />
      {count <= 1 ? "Enviar a WhatsApp" : `Enviar ${count} a WhatsApp`}
    </Button>
  );

  return (
    <Section
      index="04"
      title="Colección"
      className={className}
      aside={
        <span className="text-[13px] text-muted-foreground tabular-nums">
          {count} de {items.length} seleccionados
        </span>
      }
    >
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 3xl:grid-cols-10">
        {items.map((item) => (
          <CollectionTile
            key={item.id}
            item={item}
            selected={selected.includes(item.id)}
            disabled={sending}
            onToggle={() => toggle(item.id)}
          />
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2" aria-live="polite">
        {sending ? (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Loader2Icon className="size-4 shrink-0 animate-spin" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium tabular-nums">
                Enviando {Math.min(phase.done + 1, phase.total)} de {phase.total}…
              </p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full origin-left rounded-full bg-sound transition-transform duration-300"
                  style={{ transform: `scaleX(${phase.done / phase.total})` }}
                />
              </div>
            </div>
            <Button variant="ghost" size="sm" className="rounded-full" onClick={cancel}>
              Cancelar
            </Button>
          </div>
        ) : (
          <>
            <Button variant="ghost" size="sm" className="rounded-full" onClick={count === items.length ? clearSelection : selectAll}>
              {count === items.length ? "Ninguno" : "Todos"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full text-muted-foreground"
              disabled={count === 0}
              onClick={() => remove(selectedItems.map((i) => i.id))}
            >
              <Trash2Icon data-icon="inline-start" />
              Quitar
            </Button>
            <span className="ml-auto" />
            {ready ? (
              sendButton
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>{sendButton}</span>
                </TooltipTrigger>
                <TooltipContent>
                  {bot === undefined ? "Comprobando el bot…" : bot.available ? "El bot no está conectado" : "Arranca el bot con npm run bot"}
                </TooltipContent>
              </Tooltip>
            )}
          </>
        )}
      </div>
      <p className="mt-3 text-[12px] text-muted-foreground">
        Se envían uno tras otro, en este orden, como stickers con sonido. Los stickers se guardan 30 min.
      </p>
    </Section>
  );
}
