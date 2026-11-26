import { ADMIN_WIPE_CONFIRM, type AdminCommunity } from "@contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2Icon, TriangleAlertIcon, Trash2Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { readJson } from "@/lib/api";
import { errorMessage, notify } from "@/lib/notify";
import { queryKeys } from "@/lib/query/keys";
import { AuthedImage } from "./AuthedImage";

const auth = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
const day = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" });

/** Owner-only moderation: see every community sticker, delete one or all. */
export function CommunityAdmin({ token }: { token: string }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const key = ["admin", "community", token] as const;
  const data = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) =>
      readJson<AdminCommunity>(await fetch("/api/admin/community", { headers: auth(token), signal })),
    retry: false,
    meta: { errorMessage: false },
  });
  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: queryKeys.community.all })]);

  const removeOne = useMutation({
    mutationFn: async (id: string) =>
      readJson<{ removed: number }>(
        await fetch(`/api/admin/community/stickers/${id}`, { method: "DELETE", headers: auth(token) }),
      ),
    onSuccess: () => notify.success("Sticker borrado"),
    onError: (err) => notify.error(errorMessage(err, "No se pudo borrar.")),
    onSettled: refresh,
  });

  const items = data.data?.items ?? [];
  const q = filter.trim().toLowerCase();
  const shown = q
    ? items.filter((s) => s.title.toLowerCase().includes(q) || s.tags.some((t) => t.toLowerCase().includes(q)))
    : items;

  return (
    <section aria-label="Moderar la comunidad" className="space-y-4 rounded-3xl bg-muted/40 p-5 ring-1 ring-border/60">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Comunidad</h2>
          <p className="text-[13px] text-muted-foreground">
            {data.data ? `${items.length} stickers · ${kb(data.data.usedBytes)}` : "Cargando…"}
          </p>
        </div>
        <WipeAll token={token} count={items.length} onDone={refresh} />
      </div>

      {items.length > 6 && (
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Buscar por título o etiqueta"
          aria-label="Buscar en la comunidad"
          className="h-10 w-full rounded-xl bg-background/60 px-3 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      )}

      {data.isPending ? (
        <div className="grid h-24 place-items-center">
          <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : data.isError ? (
        <p className="text-[13px] text-destructive">{errorMessage(data.error, "No se pudo cargar la comunidad.")}</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">La comunidad está vacía.</p>
      ) : (
        <ul className="max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
          {shown.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-2xl bg-background/50 p-2">
              <AuthedImage src={s.stickerUrl} token={token} className="size-12 shrink-0 rounded-xl bg-stage object-contain" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{s.title}</p>
                <p className="truncate text-[12px] text-muted-foreground">
                  {day(s.createdAt)}
                  {s.sound ? ` · ${s.sound.durationSec.toFixed(1)} s` : " · sin sonido"}
                  {!s.listed && " · solo sonido"}
                  {` · ${s.uses} usos · ${s.saves} guardados · ${s.sends} envíos · ${s.plays} escuchas`}
                  {s.creator && ` · @${s.creator.handle}`}
                </p>
                <p className="flex gap-1.5 text-[11px]">
                  {s.hidden && <span className="rounded-full bg-retro-a/90 px-1.5 font-medium text-black">Oculto</span>}
                  {s.reports > 0 && (
                    <span className="rounded-full bg-destructive/15 px-1.5 text-destructive">
                      {s.reports} {s.reports === 1 ? "reporte" : "reportes"}
                    </span>
                  )}
                </p>
              </div>
              <DeleteButton
                title={s.title}
                busy={removeOne.isPending && removeOne.variables === s.id}
                onConfirm={() => removeOne.mutate(s.id)}
              />
            </li>
          ))}
          {shown.length === 0 && <li className="py-4 text-center text-[13px] text-muted-foreground">Sin resultados.</li>}
        </ul>
      )}
    </section>
  );
}

/** Two taps: the first arms it («¿Borrar?»), the second deletes. Disarms after 3 s. */
function DeleteButton({ title, busy, onConfirm }: { title: string; busy: boolean; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  if (busy) return <Loader2Icon className="mx-3 size-4 animate-spin text-muted-foreground" />;
  return armed ? (
    <Button
      size="sm"
      variant="destructive"
      className="rounded-full"
      onClick={() => {
        setArmed(false);
        onConfirm();
      }}
      onBlur={() => setArmed(false)}
      autoFocus
    >
      ¿Borrar?
    </Button>
  ) : (
    <Button
      size="icon"
      variant="ghost"
      className="rounded-full text-muted-foreground hover:text-destructive"
      aria-label={`Borrar «${title}»`}
      onClick={() => {
        setArmed(true);
        setTimeout(() => setArmed(false), 3000);
      }}
    >
      <Trash2Icon className="size-4" />
    </Button>
  );
}

function WipeAll({ token, count, onDone }: { token: string; count: number; onDone: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const wipe = useMutation({
    mutationFn: async () =>
      readJson<{ removed: number }>(
        await fetch("/api/admin/community", {
          method: "DELETE",
          headers: auth(token),
          body: JSON.stringify({ confirm: ADMIN_WIPE_CONFIRM }),
        }),
      ),
    onSuccess: ({ removed }) => {
      notify.success(`Comunidad vaciada: ${removed} stickers borrados`);
      setOpen(false);
      setTyped("");
    },
    onError: (err) => notify.error(errorMessage(err, "No se pudo vaciar la comunidad.")),
    onSettled: onDone,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTyped("");
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="shrink-0 rounded-full text-destructive" disabled={count === 0}>
          <Trash2Icon className="size-4" /> Borrar todos
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlertIcon className="size-5 text-destructive" /> Borrar toda la comunidad
          </DialogTitle>
          <DialogDescription>
            Se borrarán los {count} stickers y sus sonidos, con sus usos y envíos. <b>No se puede deshacer.</b>
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed === ADMIN_WIPE_CONFIRM) wipe.mutate();
          }}
        >
          <label className="block text-[13px] text-muted-foreground" htmlFor="wipe-confirm">
            Escribe <b className="font-mono text-foreground">{ADMIN_WIPE_CONFIRM}</b> para confirmar
          </label>
          <input
            id="wipe-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            className="h-11 w-full rounded-xl bg-muted/60 px-4 font-mono text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" className="rounded-full">
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant="destructive"
              className="rounded-full"
              disabled={typed !== ADMIN_WIPE_CONFIRM || wipe.isPending}
            >
              {wipe.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
              Borrar {count}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
