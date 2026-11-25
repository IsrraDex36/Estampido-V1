import type { CommunitySound } from "@contract";
import { type ReactElement, useDeferredValue, useState } from "react";
import { SearchIcon, SoundLibraryIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { InfiniteFooter } from "@/features/community/components/InfiniteFooter";
import { SoundRow, SoundRowSkeleton } from "@/features/community/components/SoundRow";
import { useSoundFeed } from "@/features/community/api/queries";
import { usePreview } from "@/features/community/store/previewStore";
import { cn } from "@/lib/utils";
import { useApplyCommunitySound } from "../../hooks/useCommunitySound";

const SORTS = [
  { id: "top", label: "Más usados" },
  { id: "new", label: "Nuevos" },
] as const;

/** «De la comunidad»: search, listen and use a community sound for this clip. */
export function CommunitySoundPicker({ disabled, trigger }: { disabled?: boolean; trigger?: ReactElement }) {
  const [open, setOpen] = useState(false);
  const stop = usePreview((s) => s.stop);
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) stop();
      }}
    >
      <DialogTrigger asChild disabled={disabled}>
        {trigger ?? (
          <Button variant="secondary" size="sm" className="w-full rounded-full">
            <SoundLibraryIcon data-icon="inline-start" />
            Comunidad
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        {open && <PickerBody onPicked={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function PickerBody({ onPicked }: { onPicked: () => void }) {
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("top");
  const [q, setQ] = useState("");
  const query = useDeferredValue(q);
  const sounds = useSoundFeed({ sort, q: query, limit: 12 });
  const { apply, loadingId } = useApplyCommunitySound();
  const stop = usePreview((s) => s.stop);
  const items = sounds.data?.pages.flatMap((p) => p.items) ?? [];

  const use = async (sound: CommunitySound) => {
    stop();
    if (await apply(sound)) onPicked();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Sonidos de la comunidad</DialogTitle>
        <DialogDescription>Escúchalos y usa el que quieras en tu video, GIF, imagen o sticker.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Buscar sonidos</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={q}
            maxLength={80}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar: risa, gol, cumpleaños…"
            className="h-10 w-full rounded-full bg-muted/60 pr-4 pl-10 text-[14px] outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <div role="tablist" aria-label="Orden" className="inline-flex rounded-full bg-muted/60 p-1">
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={sort === s.id}
              onClick={() => setSort(s.id)}
              className={cn(
                "rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
                sort === s.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="-mx-2 min-h-48 overflow-y-auto overscroll-contain px-0">
        {sounds.isPending ? (
          <ul aria-busy="true">
            {["a", "b", "c", "d"].map((k) => (
              <SoundRowSkeleton key={k} />
            ))}
          </ul>
        ) : items.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">
            {query ? "Ningún sonido coincide con tu búsqueda." : "Aún no hay sonidos publicados. ¡Publica el primero!"}
          </p>
        ) : (
          <>
            <ul className={cn("space-y-0.5 transition-opacity", sounds.isPlaceholderData && "opacity-50")}>
              {items.map((s) => (
                <SoundRow key={s.id} sound={s} onUse={use} using={loadingId === s.id} />
              ))}
            </ul>
            <InfiniteFooter
              hasNext={sounds.hasNextPage}
              loading={sounds.isFetchingNextPage}
              error={sounds.isFetchNextPageError}
              onMore={() => void sounds.fetchNextPage()}
              endLabel="No hay más sonidos."
            />
          </>
        )}
      </div>
    </>
  );
}
