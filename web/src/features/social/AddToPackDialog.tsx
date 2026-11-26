import { PACK_LIMITS, type PackSummary } from "@contract";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { CheckIcon, Loader2Icon, PlusIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { socialQueries, useInvalidatePacks } from "./api";
import { createPack, setPackItem } from "./endpoints";

/** «Agregar a pack»: tick the packs that should hold this sticker, or make a new one. */
export function AddToPackDialog({
  stickerId,
  title,
  open,
  onOpenChange,
}: {
  stickerId: string;
  title: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar a un pack</DialogTitle>
          <DialogDescription>
            <span className="block truncate">«{title}»</span>
            Hasta {PACK_LIMITS.maxStickers} stickers por pack, como en WhatsApp.
          </DialogDescription>
        </DialogHeader>
        {open && <Body stickerId={stickerId} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({ stickerId }: { stickerId: string }) {
  const packs = useQuery(socialQueries.myPacks(stickerId));
  const refresh = useInvalidatePacks();
  const [name, setName] = useState("");
  const toggle = useMutation({
    mutationFn: ({ pack, on }: { pack: PackSummary; on: boolean }) => setPackItem(pack.id, stickerId, on),
    meta: { errorMessage: false },
    onSuccess: (p, v) => notify.success(v.on ? `Agregado a «${p.name}»` : `Quitado de «${p.name}»`),
    onError: (err) => notify.error(err instanceof ApiError ? err : null, { fallback: "No se pudo actualizar el pack." }),
    onSettled: refresh,
  });
  const create = useMutation({
    mutationFn: (n: string) => createPack(n, stickerId),
    meta: { errorMessage: false },
    onSuccess: (p) => {
      setName("");
      notify.success(`Pack «${p.name}» creado con este sticker`);
    },
    onError: (err) => notify.error(err instanceof ApiError ? err : null, { fallback: "No se pudo crear el pack." }),
    onSettled: refresh,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) create.mutate(name.trim());
  };
  const containing = new Set(packs.data?.containing ?? []);

  return (
    <div className="space-y-4">
      {packs.error instanceof ApiError && packs.error.status === 401 ? (
        <p className="text-[13px] text-muted-foreground">Entra con tu WhatsApp (botón de arriba a la derecha) para armar packs.</p>
      ) : packs.isPending ? (
        <div className="grid h-20 place-items-center">
          <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (packs.data?.items.length ?? 0) === 0 ? (
        <p className="text-[13px] text-muted-foreground">Aún no tienes packs. Crea el primero:</p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {packs.data?.items.map((p) => {
            const inPack = containing.has(p.id);
            const full = !inPack && p.count >= PACK_LIMITS.maxStickers;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={full || toggle.isPending}
                  aria-pressed={inPack}
                  onClick={() => toggle.mutate({ pack: p, on: !inPack })}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-muted/60 disabled:opacity-50",
                    inPack && "bg-muted/60",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-lg ring-1",
                      inPack ? "bg-foreground text-background ring-foreground" : "ring-border",
                    )}
                    aria-hidden
                  >
                    {inPack && <CheckIcon className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{p.name}</span>
                  <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">
                    {full ? "lleno" : `${p.count}/${PACK_LIMITS.maxStickers}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={PACK_LIMITS.maxName}
          placeholder="Nuevo pack (ej. Reacciones del grupo)"
          aria-label="Nombre del pack nuevo"
          className="h-10 min-w-0 flex-1 rounded-full bg-muted/60 px-4 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" className="h-10 shrink-0 rounded-full" disabled={!name.trim() || create.isPending}>
          {create.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />} Crear
        </Button>
      </form>
    </div>
  );
}
