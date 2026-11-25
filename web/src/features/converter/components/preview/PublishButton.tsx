import { COMMUNITY_CATEGORIES, COMMUNITY_LIMITS, type CommunityCategory, type ConvertResponse } from "@contract";
import { useId, useState } from "react";
import { useLocation } from "wouter";
import { ROUTES } from "@/app/routes";
import { CheckIcon, CommunityIcon, Loader2Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { usePublish } from "@/features/community/api/mutations";
import { useFavorites } from "@/features/community/store/favoritesStore";
import { cn } from "@/lib/utils";
import { parseTags } from "../../model/publish";
import { useConverterStore } from "../../store/converterStore";
import { notify } from "@/lib/notify";

/** «Publicar»: share this result with the community (category, title, tags, audio rights). */
export function PublishButton({ result }: { result: ConvertResponse }) {
  const [open, setOpen] = useState(false);
  const [publishedId, setPublishedId] = useState<{ result: string; sticker: string } | null>(null);
  const [, navigate] = useLocation();
  const done = publishedId?.result === result.id;

  if (done) {
    return (
      <Button variant="secondary" className="h-12 rounded-full px-5" onClick={() => navigate(ROUTES.community)}>
        <CheckIcon data-icon="inline-start" />
        Publicado · Ver
      </Button>
    );
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" className="h-12 rounded-full px-5">
          <CommunityIcon data-icon="inline-start" />
          Publicar
        </Button>
      </DialogTrigger>
      <DialogContent>
        {open && (
          <PublishForm
            result={result}
            onDone={(stickerId) => {
              setPublishedId({ result: result.id, sticker: stickerId });
              setOpen(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PublishForm({ result, onDone }: { result: ConvertResponse; onDone: (stickerId: string) => void }) {
  const soundOrigin = useConverterStore((s) => s.resultSoundOrigin);
  const addPublished = useFavorites((s) => s.addPublished);
  const publish = usePublish();
  const [, navigate] = useLocation();
  const [category, setCategory] = useState<CommunityCategory | null>(null);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [owns, setOwns] = useState(false);
  const ids = { title: useId(), tags: useId(), owns: useId() };

  const needsRights = result.audio !== null && !soundOrigin;
  const canSubmit = category !== null && (!needsRights || owns) && !publish.isPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) return;
    try {
      const sticker = await publish.mutateAsync({
        resultId: result.id,
        category,
        title: title.trim() || undefined,
        tags: parseTags(tags),
        ownsAudio: needsRights ? owns : undefined,
        soundOrigin,
      });
      addPublished(sticker);
      onDone(sticker.id);
      notify.success("¡Publicado en la comunidad!", {
        action: { label: "Ver", onClick: () => navigate(ROUTES.community) },
      });
    } catch {
      // Error toast comes from the global MutationCache (API message); the form stays open to retry.
    }
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Publicar en la comunidad</DialogTitle>
        <DialogDescription>
          Otros podrán escucharlo, guardarlo y usar su sonido en sus propios clips.
        </DialogDescription>
      </DialogHeader>

      <div className="-mx-1 min-h-0 space-y-5 overflow-y-auto px-1">
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium">
            Categoría <span className="text-muted-foreground">(obligatoria)</span>
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {COMMUNITY_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={category === c.id}
                onClick={() => setCategory(c.id)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-3 py-1 text-[13px] transition-colors",
                  category === c.id
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                )}
              >
                <span aria-hidden>{c.emoji}</span>
                {c.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label htmlFor={ids.title} className="space-y-1.5">
            <span className="text-[13px] font-medium">Título</span>
            <input
              id={ids.title}
              value={title}
              maxLength={COMMUNITY_LIMITS.maxTitle}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Opcional"
              className="h-10 w-full rounded-xl bg-muted/60 px-3 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label htmlFor={ids.tags} className="space-y-1.5">
            <span className="text-[13px] font-medium">Etiquetas</span>
            <input
              id={ids.tags}
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="risa, gato (máx. 3)"
              className="h-10 w-full rounded-xl bg-muted/60 px-3 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        </div>

        {needsRights ? (
          <label htmlFor={ids.owns} className="flex items-start gap-3 rounded-2xl bg-muted/50 p-3 text-[13px]">
            <input
              id={ids.owns}
              type="checkbox"
              checked={owns}
              onChange={(e) => setOwns(e.target.checked)}
              className="mt-0.5 size-4 accent-[var(--sound)]"
            />
            <span>
              El audio es mío o tengo permiso para compartirlo.
              <span className="block text-muted-foreground">Sin esto no se puede publicar un sticker con sonido.</span>
            </span>
          </label>
        ) : soundOrigin ? (
          <p className="rounded-2xl bg-muted/50 p-3 text-[13px] text-muted-foreground">
            Usa un sonido de la comunidad: quedará enlazado a su origen.
          </p>
        ) : null}
      </div>

      <Button type="submit" className="h-11 rounded-full font-semibold" disabled={!canSubmit}>
        {publish.isPending && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
        {publish.isPending ? "Publicando…" : "Publicar"}
      </Button>
    </form>
  );
}
