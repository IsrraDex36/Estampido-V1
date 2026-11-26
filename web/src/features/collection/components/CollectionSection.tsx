import { lazy, Suspense, useState } from "react";
import { CommunityIcon, Loader2Icon, SendIcon, Trash2Icon } from "@/components/icons";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useBotStatus } from "@/features/bot/api";
import { useSelfSend } from "@/features/self/useSelfSend";
import { Section } from "@/components/section";
import { selectSelectedItems, useCollectionStore } from "../collectionStore";
import { CollectionTile } from "./CollectionTile";

// The batch form (and the publish model behind it) loads only when used.
const loadPublish = () => import("./BatchPublishDialog");
const BatchPublishDialog = lazy(() => loadPublish().then((m) => ({ default: m.BatchPublishDialog })));

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
  // Your own WhatsApp → your own «Tú» chat, all selected in one connection.
  const self = useSelfSend();
  const [publishOpen, setPublishOpen] = useState(false);

  if (items.length === 0) return null;
  const sending = self.sending;
  const ready = bot?.available === true;
  const count = selectedItems.length;

  const onSend = () => self.send({ results: selectedItems.map((i) => i.id) }, "Tu sticker");

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
          <div className="flex min-w-0 flex-1 items-center gap-3" role="status">
            <Loader2Icon className="size-4 shrink-0 animate-spin" />
            <p className="text-[13px] font-medium tabular-nums">Enviando {count} a tu chat «Tú»…</p>
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
            {count >= 2 && (
              <Button
                variant="secondary"
                className="h-11 rounded-full"
                onClick={() => setPublishOpen(true)}
                onPointerEnter={() => void loadPublish()}
              >
                <CommunityIcon data-icon="inline-start" />
                Publicar {count}
              </Button>
            )}
            {ready ? (
              sendButton
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>{sendButton}</span>
                </TooltipTrigger>
                <TooltipContent>
                  {bot === undefined ? "Comprobando el envío…" : "El envío directo está en pausa: descarga cada sticker desde el resultado."}
                </TooltipContent>
              </Tooltip>
            )}
          </>
        )}
      </div>
      <p className="mt-3 text-[12px] text-muted-foreground">
        Se envían uno tras otro, en este orden, como stickers con sonido. Los stickers se guardan 30 min.
      </p>
      {publishOpen && (
        <Suspense fallback={null}>
          <BatchPublishDialog items={selectedItems} open={publishOpen} onOpenChange={setPublishOpen} />
        </Suspense>
      )}
    </Section>
  );
}
