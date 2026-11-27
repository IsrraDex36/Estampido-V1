import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { type ReactNode, useState } from "react";
import { Link } from "wouter";
import { ROUTES } from "@/app/routes";
import {
  AudioWaveformIcon,
  CheckIcon,
  Volume2Icon,
  VolumeXIcon,
  CompassIcon,
  DownloadIcon,
  LockIcon,
  RocketIcon,
  SendIcon,
  StarIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Mascot, type MascotMood } from "@/components/pixel/Mascot";
import { sfx, useSfx } from "@/lib/sfx";
import { useTourStore } from "./tourStore";

interface Step {
  icon: ReactNode;
  tone: "sound" | "retro" | "muted";
  /** What Pum says in its speech bubble. */
  say: string;
  mood: MascotMood;
  title: string;
  lead: string;
  body: ReactNode;
}

const STEPS: Step[] = [
  {
    icon: <AudioWaveformIcon weight="duotone" />,
    tone: "sound",
    say: "¡Hola! Soy Pum 👋",
    mood: "singing",
    title: "Bienvenido a Estampido",
    lead: "Convierte un video, GIF o imagen en un sticker de WhatsApp que suena al tocarlo.",
    body: (
      <ol className="space-y-2">
        <Bullet n="1">
          <b>Elige tu clip</b> y marca el tramo.
        </Bullet>
        <Bullet n="2">
          <b>Ajusta</b> el sonido (del video, tu voz, un audio o de la comunidad), el encuadre y el fondo.
        </Bullet>
        <Bullet n="3">
          <b>Crea</b> el sticker y llévalo a WhatsApp por uno de los dos caminos que te mostramos ahora.
        </Bullet>
      </ol>
    ),
  },
  {
    icon: <SendIcon weight="duotone" />,
    tone: "sound",
    say: "Te explico cómo llega a tu WhatsApp",
    mood: "idle",
    title: "Dos caminos para llevarlo a WhatsApp",
    lead: "Ambos están en «Resultado» cuando tu sticker esté listo.",
    body: (
      <div className="space-y-2.5">
        <Path
          badge="Recomendado hoy"
          icon={<SendIcon />}
          title="Enviar a mi WhatsApp"
          text="Conectas tu WhatsApp una sola vez con un código (como WhatsApp Web) y te llega a tu chat «Tú» con sonido. Solo te escribimos a ti y no vemos tus chats."
        />
        <Path
          badge="Beta de WhatsApp"
          icon={<DownloadIcon />}
          title="Crearlo tú en WhatsApp"
          text="Descargas un video MP4 preparado y en WhatsApp vas a Stickers → Crear → eliges el video. Hoy solo funciona en Android con WhatsApp Beta, y no en todas las cuentas."
        />
      </div>
    ),
  },
  {
    icon: <StarIcon weight="duotone" />,
    tone: "retro",
    say: "Truco: créalo una vez, úsalo siempre",
    mood: "singing",
    title: "Guárdalo y compártelo",
    lead: "Así lo creas una vez y lo usas siempre.",
    body: (
      <ol className="space-y-2">
        <Bullet n="1">
          Cuando te llegue, <b>mantenlo presionado → Añadir a favoritos ⭐</b>.
        </Bullet>
        <Bullet n="2">
          Desde tus stickers lo mandas a <b>quien quieras y a tus grupos</b>; quien lo recibe también puede guardarlo y
          reenviarlo.
        </Bullet>
        <Bullet n="3">
          Si a alguien no le suena, es que WhatsApp todavía no le activó los stickers con sonido: que actualice la app.
        </Bullet>
      </ol>
    ),
  },
  {
    icon: <CompassIcon weight="duotone" />,
    tone: "muted",
    say: "Te cuento la verdad, sin humo",
    mood: "idle",
    title: "Cómo está hoy y a dónde vamos",
    lead: "Los stickers con sonido son nuevos en WhatsApp (noviembre de 2026).",
    body: (
      <div className="space-y-2.5">
        <Fact title="Hoy">
          Recibir, guardar y reenviar stickers con sonido está llegando a todos. <b>Crearlos</b> en la app sigue en beta y
          WhatsApp no ofrece una forma oficial para que otras apps los envíen. Por eso, hoy te los mandas{" "}
          <b>tú mismo</b>, conectando tu WhatsApp a Estampido como un dispositivo (igual que WhatsApp Web).
        </Fact>
        <Fact title="Meta">
          Cuando WhatsApp abra la creación a todos, el camino «Crearlo tú en WhatsApp» será el principal: sin vincular
          nada. Estampido seguirá siendo el editor para dejarlo perfecto.
        </Fact>
      </div>
    ),
  },
  {
    icon: <LockIcon weight="duotone" />,
    tone: "sound",
    say: "Lo tuyo es tuyo, palabra de Pum",
    mood: "idle",
    title: "Tus stickers son tuyos",
    lead: "Sin letra pequeña.",
    body: (
      <ul className="space-y-2">
        <Bullet n="✓">
          Se envían <b>solo a tu chat «Tú»</b>, nunca a otras personas. El servidor <b>los borra a los 30 minutos</b>.
        </Bullet>
        <Bullet n="✓">
          Tu colección vive <b>solo en este navegador</b> y se borra al cerrar la pestaña.
        </Bullet>
        <Bullet n="✓">
          Solo aparecen en <b>Comunidad</b> si <b>tú decides publicarlos</b>.
        </Bullet>
        <Bullet n="✓">
          Al conectar tu WhatsApp <b>no leemos ni guardamos tus chats</b>: nos conectamos unos segundos solo para
          enviarte, y la conexión queda cifrada en tu navegador. La quitas cuando quieras.
        </Bullet>
      </ul>
    ),
  },
];

/** First-visit walkthrough of the options, today's situation and the plan; reopen from the header. */
export function WelcomeTour() {
  const open = useTourStore((s) => s.open);
  const close = useTourStore((s) => s.close);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0 sm:max-w-lg">{open && <TourBody onDone={close} />}</DialogContent>
    </Dialog>
  );
}

function TourBody({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const step = STEPS[i] as Step;
  const last = i === STEPS.length - 1;
  const muted = useSfx((st) => st.muted);
  const toggleSound = useSfx((st) => st.toggle);
  const go = (next: number) => {
    const n = Math.max(0, Math.min(STEPS.length - 1, next));
    if (n === i) return;
    sfx.blip(n > i);
    setDir(n > i ? 1 : -1);
    setI(n);
  };
  const finish = () => {
    sfx.tada();
    onDone();
  };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(i + 1);
        if (e.key === "ArrowLeft") go(i - 1);
      }}
    >
      <div className="relative h-1 bg-muted" aria-hidden>
        <div
          className="h-full bg-sound transition-[width] duration-300"
          style={{ width: `${((i + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-6 pb-4 sm:px-7">
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <m.div
            key={i}
            custom={dir}
            initial={{ opacity: 0, x: dir * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -24 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            className="space-y-4"
          >
            <div className="flex items-end gap-3 pt-5">
              <Mascot size={76} mood={step.mood} interactive className="shrink-0 p-1" />
              <p className="relative mb-6 rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2 text-[13px] font-medium shadow-sm">
                {step.say}
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="flex items-center gap-2 font-pixel text-[11px] text-muted-foreground">
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-lg [&_svg]:size-3.5",
                    step.tone === "sound" && "bg-sound-soft text-sound",
                    step.tone === "retro" && "bg-retro-a/15 text-retro-a",
                    step.tone === "muted" && "bg-muted text-foreground",
                  )}
                  aria-hidden
                >
                  {step.icon}
                </span>
                {i + 1} / {STEPS.length}
              </p>
              <DialogTitle className="text-xl font-semibold tracking-tight">{step.title}</DialogTitle>
              <DialogDescription className="text-[14px] leading-snug">{step.lead}</DialogDescription>
            </div>
            <div className="text-[14px] leading-relaxed">{step.body}</div>
            {last && (
              <p className="text-[12px] text-muted-foreground">
                Detalles en{" "}
                <Link href={ROUTES.privacy} onClick={onDone} className="underline underline-offset-2">
                  Privacidad
                </Link>
                . Puedes volver a ver esta guía con el botón «?» de arriba.
              </p>
            )}
          </m.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-2 border-t border-border px-6 py-4 sm:px-7">
        <button
          type="button"
          onClick={toggleSound}
          aria-pressed={muted}
          aria-label={muted ? "Activar sonidos" : "Silenciar sonidos"}
          title={muted ? "Activar sonidos" : "Silenciar sonidos"}
          className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {muted ? <VolumeXIcon className="size-4" /> : <Volume2Icon className="size-4" />}
        </button>
        <div className="mr-auto flex gap-1.5" role="tablist" aria-label="Pasos">
          {STEPS.map((s, n) => (
            <button
              key={s.title}
              type="button"
              role="tab"
              aria-selected={n === i}
              aria-label={`Paso ${n + 1}: ${s.title}`}
              onClick={() => go(n)}
              className={cn("h-2 rounded-full transition-all", n === i ? "w-5 bg-foreground" : "w-2 bg-foreground/20")}
            />
          ))}
        </div>
        {i === 0 ? (
          <Button variant="ghost" className="rounded-full" onClick={onDone}>
            Saltar
          </Button>
        ) : (
          <Button variant="ghost" className="rounded-full" onClick={() => go(i - 1)}>
            Atrás
          </Button>
        )}
        <Button className="rounded-full px-5 font-semibold" onClick={() => (last ? finish() : go(i + 1))} autoFocus>
          {last ? (
            <>
              <RocketIcon data-icon="inline-start" /> ¡Empezar!
            </>
          ) : (
            "Siguiente"
          )}
        </Button>
      </div>
    </div>
  );
}

function Bullet({ n, children }: { n: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold">
        {n === "✓" ? <CheckIcon className="size-3 text-sound" weight="bold" /> : n}
      </span>
      <span>{children}</span>
    </li>
  );
}

function Path({ badge, icon, title, text }: { badge: string; icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-muted/60 p-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-background text-sound shadow-sm [&_svg]:size-4.5">
        {icon}
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="flex flex-wrap items-center gap-x-2 text-[14px] font-semibold">
          {title}
          <span className="rounded-full bg-sound-soft px-2 py-0.5 text-[11px] font-medium text-sound">{badge}</span>
        </p>
        <p className="text-[13px] leading-snug text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

function Fact({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-muted/60 p-3.5">
      <p className="mb-1 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>
      <p className="text-[13px] leading-relaxed">{children}</p>
    </div>
  );
}
