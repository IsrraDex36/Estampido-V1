import { PACK_LIMITS, PACK_STICKER_PUBLISHER } from "@contract";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { creatorHref, ROUTES } from "@/app/routes";
import { Loader2Icon, SendIcon, Share2Icon, TimerIcon, Trash2Icon } from "@/components/icons";
import { Mascot } from "@/components/pixel/Mascot";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/features/account/Avatar";
import { LinkDialog } from "@/features/bot/LinkDialog";
import { useBotStatus } from "@/features/bot/api";
import { useLinkGate } from "@/features/bot/useLinkGate";
import { useBatchSend } from "@/features/collection/useBatchSend";
import { StickerCard } from "@/features/community/components/StickerCard";
import { ApiError, sendCommunityToWhatsApp } from "@/lib/api";
import { notify } from "@/lib/notify";
import { socialQueries, useInvalidatePacks } from "./api";
import { estimatePackSec, etaLabel, remainingSec } from "./packEta";
import { deletePack, renamePack, setPackItem } from "./endpoints";

/** A pack: send all of it to WhatsApp in one go, share it; its owner edits it. */
export default function PackPage() {
  const { id = "" } = useParams<{ id: string }>();
  const pack = useQuery(socialQueries.pack(id));
  const refresh = useInvalidatePacks();
  const [, navigate] = useLocation();
  // Sent as this pack: every sticker carries the pack's name and the app's mark.
  const sendOne = useCallback((stickerId: string) => sendCommunityToWhatsApp(stickerId, id), [id]);
  const batch = useBatchSend(sendOne);
  const bot = useBotStatus();
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (batch.phase.kind !== "sending") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [batch.phase.kind]);
  const { gate, dialog } = useLinkGate();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const p = pack.data;

  useEffect(() => {
    if (p) document.title = `${p.name} · pack de @${p.owner.handle} · Estampido`;
  }, [p]);

  const rename = useMutation({
    mutationFn: (n: string) => renamePack(id, n),
    onSuccess: () => {
      setEditing(false);
      void refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (stickerId: string) => setPackItem(id, stickerId, false),
    onSuccess: () => void refresh(),
  });
  const destroy = useMutation({
    mutationFn: () => deletePack(id),
    onSuccess: () => {
      notify.success("Pack borrado");
      void refresh();
      navigate(`${ROUTES.community}?tab=espacio`);
    },
  });

  if (pack.error instanceof ApiError && pack.error.status === 404) {
    return (
      <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 py-20 text-center">
        <Mascot size={88} />
        <h1 className="display text-3xl">Ese pack no existe</h1>
        <Button asChild className="rounded-full">
          <Link href={ROUTES.community}>Ir a la comunidad</Link>
        </Button>
      </div>
    );
  }
  if (!p) {
    return (
      <div className="space-y-4 py-10">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }

  const sending = batch.phase.kind === "sending";
  const estimate = estimatePackSec(p.count, bot?.pace);
  const left =
    batch.phase.kind === "sending"
      ? remainingSec(batch.phase.done, batch.phase.total, Math.max(0, now - startedAt), estimate)
      : 0;
  const sendAll = () =>
    gate(async () => {
      const t0 = Date.now();
      setStartedAt(t0);
      setNow(t0);
      const r = await batch.send(p.items.map((s) => s.id));
      if (r.kind === "finished") {
        if (r.failed === 0 && !r.stoppedReason) notify.success(`¡Listo! ${r.sent} stickers en tu chat.`);
        else notify.warning(`${r.sent} enviados, ${r.failed} con error${r.stoppedReason ? ` · ${r.stoppedReason}` : ""}.`);
      }
    });
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: `${p.name} · Estampido`, url: window.location.href });
      else {
        await navigator.clipboard.writeText(window.location.href);
        notify.success("Enlace del pack copiado");
      }
    } catch {
      // share sheet closed
    }
  };

  return (
    <div className="space-y-6 py-8 sm:py-10">
      <header className="space-y-3">
        <p className="font-pixel text-[10px] text-muted-foreground">PACK · {p.count}/{PACK_LIMITS.maxStickers}</p>
        {editing ? (
          <form
            className="flex max-w-xl gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) rename.mutate(name.trim());
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={PACK_LIMITS.maxName}
              aria-label="Nombre del pack"
              // biome-ignore lint/a11y/noAutofocus: editing was just requested
              autoFocus
              className="h-11 min-w-0 flex-1 rounded-xl bg-muted/60 px-3 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="submit" className="h-11 rounded-full" disabled={!name.trim() || rename.isPending}>
              Guardar
            </Button>
            <Button type="button" variant="ghost" className="h-11 rounded-full" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </form>
        ) : (
          <h1 className="display text-4xl break-words sm:text-5xl">{p.name}</h1>
        )}
        <Link href={creatorHref(p.owner.handle)} className="inline-flex max-w-full items-center gap-2 text-[14px] text-muted-foreground hover:text-foreground">
          <Avatar avatar={p.owner.avatar} size={22} />
          <span className="truncate">
            de <b className="text-foreground">{p.owner.displayName}</b> @{p.owner.handle}
          </span>
        </Link>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button className="h-11 rounded-full px-5 font-semibold" disabled={p.count === 0 || sending} onClick={sendAll}>
            {sending ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
            {sending && batch.phase.kind === "sending"
              ? `Enviando ${batch.phase.done}/${batch.phase.total}…`
              : `Enviar los ${p.count} a mi WhatsApp`}
          </Button>
          {sending && (
            <Button variant="ghost" className="h-11 rounded-full" onClick={batch.cancel}>
              Detener
            </Button>
          )}
          <Button variant="secondary" className="h-11 rounded-full" onClick={share}>
            <Share2Icon className="size-4" /> Compartir
          </Button>
          {p.mine && !editing && (
            <>
              <Button
                variant="ghost"
                className="h-11 rounded-full"
                onClick={() => {
                  setName(p.name);
                  setEditing(true);
                }}
              >
                Renombrar
              </Button>
              <Button
                variant="ghost"
                className="h-11 rounded-full text-destructive"
                disabled={destroy.isPending}
                onClick={() => {
                  if (window.confirm(`¿Borrar el pack «${p.name}»? Los stickers no se borran.`)) destroy.mutate();
                }}
              >
                <Trash2Icon className="size-4" /> Borrar pack
              </Button>
            </>
          )}
        </div>
        {!sending && p.count > 0 && estimate >= 45 && (
          <p className="flex items-start gap-1.5 text-[12px] text-muted-foreground">
            <TimerIcon className="mt-px size-3.5 shrink-0" />
            Tardará {etaLabel(estimate)}: los enviamos con calma para cuidar el número. Puedes dejar esta pestaña abierta y
            seguir usando tu WhatsApp.
          </p>
        )}
        {sending && batch.phase.kind === "sending" && (
          <p className="text-[12px] text-muted-foreground tabular-nums" role="status">
            {batch.phase.done}/{batch.phase.total} enviados · faltan {etaLabel(left)}
          </p>
        )}
        <p className="text-[12px] text-muted-foreground">
          Llegan a tu WhatsApp como el pack «{p.name} · @{p.owner.handle}» · {PACK_STICKER_PUBLISHER}
        </p>
        {sending && batch.phase.kind === "sending" && (
          <div className="h-1 max-w-md overflow-hidden rounded-full bg-foreground/10" role="progressbar" aria-valuenow={batch.phase.done} aria-valuemax={batch.phase.total}>
            <div
              className="h-full origin-left rounded-full bg-sound transition-transform"
              style={{ transform: `scaleX(${batch.phase.done / Math.max(1, batch.phase.total)})` }}
            />
          </div>
        )}
      </header>

      {p.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-stage px-6 py-12 text-center">
          <Mascot size={72} />
          <p className="max-w-sm text-[14px] text-muted-foreground">
            {p.mine
              ? "Tu pack está vacío. En la comunidad, abre el menú ⋯ de un sticker → «Agregar a pack»."
              : "Este pack aún no tiene stickers."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {p.items.map((s) => (
            <div key={s.id} className="flex flex-col gap-1.5">
              <StickerCard sticker={s} className="flex-1" />
              {p.mine && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full text-muted-foreground hover:text-destructive"
                  disabled={remove.isPending && remove.variables === s.id}
                  onClick={() => remove.mutate(s.id)}
                >
                  Quitar del pack
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      <LinkDialog {...dialog} />
    </div>
  );
}
