import { useEffect, useState } from "react";
import { CheckIcon, CircleCheckIcon, ExternalIcon, Loader2Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "wouter";
import { ROUTES } from "@/app/routes";
import { Mascot } from "@/components/pixel/Mascot";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useMe } from "@/features/account/api";
import { Avatar } from "@/features/account/Avatar";
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
  // Only automatically while it hasn't failed: a failing request must not retry in a
  // tight loop (that would hammer the server exactly when it's busy) → «Reintentar».
  const { mutate: createCode, isPending: creating, isError: createFailed } = create;
  useEffect(() => {
    if (bot?.connected && state === "unlinked" && !creating && !createFailed) createCode();
  }, [bot?.connected, state, creating, createFailed, createCode]);

  if (!bot?.connected) {
    return (
      <Hero mood="idle" title="El envío a WhatsApp está en pausa" tone="muted">
        <p>Vuelve en unos minutos. Mientras, puedes crear, descargar y compartir tus stickers.</p>
      </Hero>
    );
  }

  if (link.data?.state === "linked") {
    return (
      <>
        <Hero mood="singing" title="¡Listo, estás dentro!" tone="ok">
          <p>
            Los stickers que envíes desde aquí llegan a tu chat <b className="text-foreground">{link.data.phone}</b>.
          </p>
        </Hero>
        <SignedInAs onNavigate={onDone} />
        <div className="flex gap-2">
          <Button className="h-11 flex-1 rounded-full font-semibold" onClick={onDone}>
            Listo
          </Button>
          <Button variant="ghost" className="h-11 rounded-full" disabled={unlink.isPending} onClick={() => unlink.mutate()}>
            Cerrar sesión
          </Button>
        </div>
      </>
    );
  }

  const pending = link.data?.state === "pending" ? link.data : null;
  const failed = !pending && create.isError;
  return (
    <>
      <Hero mood={pending ? "singing" : "idle"} title="Entra con tu WhatsApp">
        <p>Sin contraseñas ni correos: solo manda un mensaje.</p>
      </Hero>

      <ul className="grid grid-cols-3 gap-2 text-center text-[11px] text-muted-foreground" aria-label="Lo que obtienes">
        {[
          ["🎧", "Stickers con sonido a tu chat"],
          ["⭐", "Tus guardados en todos lados"],
          ["🙋", "Tu perfil de creador"],
        ].map(([emoji, label]) => (
          <li key={label} className="rounded-2xl bg-muted/50 px-1.5 py-2.5">
            <span className="block text-[18px] leading-none" aria-hidden>
              {emoji}
            </span>
            <span className="mt-1 block leading-tight">{label}</span>
          </li>
        ))}
      </ul>

      {failed ? (
        <div className="space-y-3 rounded-2xl bg-stage px-4 py-5 text-center" role="alert">
          <p className="text-[14px] font-medium">No pudimos generar tu código</p>
          <p className="text-[13px] text-muted-foreground">
            {create.error instanceof ApiError && create.error.status === 429
              ? "Muchas personas entrando a la vez desde tu red. Espera un momento y reintenta."
              : "Revisa tu conexión e inténtalo de nuevo."}
          </p>
          <Button variant="secondary" className="rounded-full" disabled={creating} onClick={() => createCode()}>
            Reintentar
          </Button>
        </div>
      ) : !pending ? (
        <div className="grid h-44 place-items-center rounded-2xl bg-stage" aria-busy="true">
          <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl bg-stage px-4 pt-4 pb-3 text-center">
            <p className="font-pixel text-[10px] text-muted-foreground">TU CÓDIGO</p>
            <CodeTiles code={pending.code} />
            <Countdown until={pending.expiresAt} onExpire={() => createCode()} />
          </div>

          <ol className="grid gap-1.5 text-[13px]">
            {["Toca «Abrir WhatsApp»: el mensaje ya va escrito.", "En WhatsApp solo toca Enviar.", "Regresa aquí: entras solo."].map(
              (step, i) => (
                <li key={step} className="flex items-center gap-2.5">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-[12px] font-semibold text-background">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{step}</span>
                </li>
              ),
            )}
          </ol>

          <div className="flex flex-wrap gap-2">
            {pending.waLink ? (
              <Button asChild className="h-12 flex-1 rounded-full bg-[#25d366] font-semibold text-black hover:bg-[#25d366]/90">
                <a href={pending.waLink} target="_blank" rel="noreferrer">
                  <ExternalIcon data-icon="inline-start" />
                  Abrir WhatsApp
                </a>
              </Button>
            ) : null}
            <CopyButton text={pending.code} />
          </div>

          <p className="flex items-center justify-center gap-2 text-[13px] text-muted-foreground" role="status">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-sound opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex size-2 rounded-full bg-sound" />
            </span>
            Esperando tu mensaje…
          </p>
          <p className="text-center text-[11px] text-muted-foreground">
            Solo te enviamos lo que pidas. Puedes salir cuando quieras.{" "}
            <a href={ROUTES.privacy} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              Privacidad
            </a>
          </p>
        </div>
      )}
    </>
  );
}

/** Mascot + title + text, the top of every state of the dialog. */
function Hero({
  mood,
  title,
  tone,
  children,
}: {
  mood: "idle" | "singing";
  title: string;
  tone?: "ok" | "muted";
  children: React.ReactNode;
}) {
  return (
    <DialogHeader className="flex flex-col items-center px-8 text-center">
      <div className={cn("mx-auto grid size-20 place-items-center rounded-full", tone === "ok" ? "bg-sound/15" : "bg-stage")}>
        <Mascot size={56} mood={mood} />
      </div>
      <DialogTitle className="flex items-center justify-center gap-2 text-[20px]">
        {tone === "ok" && <CircleCheckIcon className="size-5 text-sound" weight="fill" />}
        {title}
      </DialogTitle>
      <DialogDescription asChild>
        <div className="text-[14px]">{children}</div>
      </DialogDescription>
    </DialogHeader>
  );
}

/** The code, one big tile per character (easy to read aloud or retype). */
function CodeTiles({ code }: { code: string }) {
  const [prefix, rest = ""] = code.split("-");
  return (
    <p className="mt-2 flex items-center justify-center gap-1.5" aria-label={`Código ${code}`} aria-live="polite">
      <span className="mr-0.5 font-mono text-[15px] font-semibold text-muted-foreground" aria-hidden>
        {prefix}-
      </span>
      {[...rest].map((ch, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: characters can repeat; position is the identity
          key={i}
          aria-hidden
          className="grid h-11 w-9 place-items-center rounded-xl bg-background font-mono text-[22px] font-semibold shadow-sm ring-1 ring-border"
        >
          {ch}
        </span>
      ))}
    </p>
  );
}

/** Once linked, the account opens by itself: show who's signed in. */
function SignedInAs({ onNavigate }: { onNavigate: () => void }) {
  const me = useMe();
  if (me.isFetching && !me.data) {
    return (
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground" role="status">
        <Loader2Icon className="size-4 animate-spin" /> Abriendo tu cuenta…
      </p>
    );
  }
  if (!me.data) return null;
  return (
    <Link
      href={ROUTES.account}
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-2xl bg-muted/60 p-3 transition-colors hover:bg-muted"
    >
      <Avatar avatar={me.data.avatar} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{me.data.displayName}</span>
        <span className="block truncate text-[12px] text-muted-foreground">@{me.data.handle} · Ver mi cuenta</span>
      </span>
    </Link>
  );
}

function Countdown({ until, onExpire }: { until: number; onExpire: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const [total] = useState(() => Math.max(1, until - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, (until - now) / 1000);
  useEffect(() => {
    if (left === 0) onExpire();
  }, [left, onExpire]);
  return (
    <div className="mt-3 space-y-1">
      <div className="h-1 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
        <div
          className="h-full origin-left rounded-full bg-sound transition-transform duration-1000 ease-linear"
          style={{ transform: `scaleX(${Math.min(1, (left * 1000) / total)})` }}
        />
      </div>
      <p className="text-[12px] text-muted-foreground tabular-nums">Caduca en {formatTime(Math.ceil(left))} · luego te damos otro</p>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      className="h-12 rounded-full"
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
