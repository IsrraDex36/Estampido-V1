import { useEffect, useState } from "react";
import { CheckIcon, CircleCheckIcon, ExternalIcon, Loader2Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ROUTES } from "@/app/routes";
import { formatTime } from "@/lib/time";
import { useBotStatus, useCreateLink, useLink, useUnlink } from "./api";

/**
 * «Vincular mi WhatsApp»: one tap opens WhatsApp with the code typed in; the
 * user only hits Send. The dialog waits live (polling) and confirms. When
 * already linked it shows the masked number and «Desvincular».
 */
export function LinkDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">{open && <LinkBody onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function LinkBody({ onDone }: { onDone: () => void }) {
  const bot = useBotStatus();
  const link = useLink();
  const create = useCreateLink();
  const unlink = useUnlink();
  const state = link.data?.state;

  // Opening the dialog unlinked → ask for a code right away (one less tap).
  const { mutate: createCode, isPending: creating } = create;
  useEffect(() => {
    if (bot?.connected && state === "unlinked" && !creating) createCode();
  }, [bot?.connected, state, creating, createCode]);

  if (!bot?.connected) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>WhatsApp no disponible</DialogTitle>
          <DialogDescription>
            {bot?.available ? "El bot está corriendo pero no está conectado a WhatsApp." : "El bot de envío está apagado."}
          </DialogDescription>
        </DialogHeader>
        <p className="text-[13px] text-muted-foreground">Mientras tanto puedes descargar el sticker o compartirlo.</p>
      </>
    );
  }

  if (link.data?.state === "linked") {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleCheckIcon className="size-5 text-sound" weight="fill" /> WhatsApp vinculado
          </DialogTitle>
          <DialogDescription>
            Los stickers que envíes desde este navegador llegan a tu chat <b className="text-foreground">{link.data.phone}</b>.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Button className="flex-1 rounded-full" onClick={onDone}>
            Listo
          </Button>
          <Button variant="ghost" className="rounded-full" disabled={unlink.isPending} onClick={() => unlink.mutate()}>
            Desvincular
          </Button>
        </div>
      </>
    );
  }

  const pending = link.data?.state === "pending" ? link.data : null;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Vincula tu WhatsApp</DialogTitle>
        <DialogDescription>
          Una sola vez: envía este código desde tu WhatsApp y te mandaremos los stickers con sonido a ese chat.
        </DialogDescription>
      </DialogHeader>

      {!pending ? (
        <div className="grid h-40 place-items-center" aria-busy="true">
          <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl bg-stage px-4 py-5 text-center">
            <p className="font-pixel text-[10px] text-muted-foreground">TU CÓDIGO</p>
            <p className="mt-1 font-mono text-3xl font-semibold tracking-[0.2em] tabular-nums" aria-live="polite">
              {pending.code}
            </p>
            <Countdown until={pending.expiresAt} onExpire={() => createCode()} />
          </div>

          <ol className="space-y-1.5 text-[13px] text-muted-foreground">
            <li>1. Toca «Abrir WhatsApp»: el mensaje ya va escrito.</li>
            <li>2. Solo toca Enviar en WhatsApp.</li>
            <li>3. Vuelve aquí: se vincula solo.</li>
          </ol>

          <div className="flex flex-wrap gap-2">
            {pending.waLink ? (
              <Button asChild className="h-11 flex-1 rounded-full font-semibold">
                <a href={pending.waLink} target="_blank" rel="noreferrer">
                  <ExternalIcon data-icon="inline-start" />
                  Abrir WhatsApp
                </a>
              </Button>
            ) : null}
            <CopyButton text={pending.code} />
          </div>

          <p className="flex items-center justify-center gap-2 text-[13px] text-muted-foreground" role="status">
            <Loader2Icon className="size-4 animate-spin" /> Esperando tu mensaje…
          </p>
          <p className="text-center text-[11px] text-muted-foreground">
            Solo te enviaremos lo que pidas. Puedes desvincularte cuando quieras.{" "}
            <a href={ROUTES.privacy} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              Privacidad
            </a>
          </p>
        </div>
      )}
    </>
  );
}

function Countdown({ until, onExpire }: { until: number; onExpire: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, (until - now) / 1000);
  useEffect(() => {
    if (left === 0) onExpire();
  }, [left, onExpire]);
  return <p className="mt-1 text-[12px] text-muted-foreground tabular-nums">Caduca en {formatTime(Math.ceil(left))}</p>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      className="h-11 rounded-full"
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      {copied ? <CheckIcon data-icon="inline-start" /> : null}
      {copied ? "Copiado" : "Copiar código"}
    </Button>
  );
}
