import { COMMUNITY_CATEGORIES, COMMUNITY_LIMITS, type CommunityCategory } from "@contract";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { Loader2Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { publishSticker } from "@/features/community/api/endpoints";
import { parseTags } from "@/features/converter/model/publish";
import { notify } from "@/lib/notify";
import { queryKeys } from "@/lib/query/keys";
import { cn } from "@/lib/utils";
import type { CollectionItem } from "../collectionStore";
import { publishMany } from "../publishMany";

export function BatchPublishDialog({
  items,
  open,
  onOpenChange,
}: {
  items: CollectionItem[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const ids = { tags: useId(), owns: useId() };
  const [category, setCategory] = useState<CommunityCategory | null>(null);
  const [tags, setTags] = useState("");
  const [owns, setOwns] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const withSound = items.some((i) => i.audioUrl);
  const busy = done !== null;
  const canSubmit = category !== null && (!withSound || owns) && !busy;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!category) return;
    setDone(0);
    const r = await publishMany(items, { category, tags: parseTags(tags), ownsAudio: owns }, publishSticker, setDone);
    setDone(null);
    void qc.invalidateQueries({ queryKey: queryKeys.community.all });
    if (r.published === items.length) notify.success(`${r.published} stickers publicados en la comunidad`);
    else if (r.published > 0) notify.warning(`Publicados ${r.published} de ${items.length}.${r.stopped ? ` ${r.stopped}` : ""}`);
    else notify.error(r.stopped ?? "No se pudo publicar.");
    if (r.published > 0) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Publicar {items.length} stickers</DialogTitle>
          <DialogDescription>Misma categoría y etiquetas para todos. Puedes editarlos después en tu cuenta.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div role="radiogroup" aria-label="Categoría" className="flex flex-wrap gap-1.5">
            {COMMUNITY_CATEGORIES.map((c) => (
              // biome-ignore lint/a11y/useSemanticElements: chips styled as radio buttons
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={category === c.id}
                disabled={busy}
                onClick={() => setCategory(c.id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[13px] transition-colors",
                  category === c.id ? "bg-foreground text-background" : "bg-muted/60 hover:bg-muted",
                )}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.tags} className="flex items-baseline justify-between text-[13px] font-medium">
              Etiquetas
              <span className="font-normal text-muted-foreground">máx. {COMMUNITY_LIMITS.maxTags}</span>
            </label>
            <input
              id={ids.tags}
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              disabled={busy}
              placeholder="risa, gato"
              autoCapitalize="none"
              className="h-10 w-full rounded-xl bg-muted/60 px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {withSound && (
            <label htmlFor={ids.owns} className="flex items-start gap-3 rounded-2xl bg-muted/50 p-3 text-[13px]">
              <input id={ids.owns} type="checkbox" checked={owns} disabled={busy} onChange={(e) => setOwns(e.target.checked)} className="mt-0.5 size-4" />
              <span>Los sonidos son míos o tengo permiso para compartirlos.</span>
            </label>
          )}
          {busy && (
            <div className="space-y-1.5" role="status">
              <p className="text-[13px] tabular-nums">
                Publicando {Math.min((done ?? 0) + 1, items.length)} de {items.length}…
              </p>
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full origin-left rounded-full bg-sound transition-transform"
                  style={{ transform: `scaleX(${(done ?? 0) / items.length})` }}
                />
              </div>
            </div>
          )}
          <Button type="submit" className="h-11 w-full rounded-full font-semibold" disabled={!canSubmit}>
            {busy && <Loader2Icon className="size-4 animate-spin" />}
            Publicar {items.length}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
