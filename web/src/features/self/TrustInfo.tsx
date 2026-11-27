import { type ReactNode, useState } from "react";
import { Link } from "wouter";
import { ROUTES } from "@/app/routes";
import { CheckIcon, EyeSlashIcon, KeyIcon, LinkBreakIcon, ShieldCheckIcon, XIcon } from "@/components/icons";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Trust, said plainly. Every sentence here must be literally true of the code:
 * - sends only to the person's own jid (selfSession: own chat only)
 * - connects only while sending, then closes (ephemeral socket)
 * - the sealed session lives in the browser; the server keeps no copy
 * - we keep the last 4 digits of the number (account hint), never the full one
 * - no history sync, nothing read or stored from chats
 */
const TRUST_PROMISES = [
  {
    icon: ShieldCheckIcon,
    title: "Solo te escribimos a ti",
    text: "Los stickers llegan a tu chat «Tú». Nunca escribimos a tus contactos ni a tus grupos.",
  },
  {
    icon: EyeSlashIcon,
    title: "No vemos tus chats",
    text: "No leemos ni guardamos tus mensajes, contactos ni fotos. Nos conectamos unos segundos, solo para enviar.",
  },
  {
    icon: KeyIcon,
    title: "Tú tienes la llave",
    text: "La conexión queda cifrada en este navegador, no en nuestro servidor. La quitas cuando quieras.",
  },
] as const;

/** The three promises, compact (link dialog, account page). */
export function TrustPromises({ className }: { className?: string }) {
  return (
    <ul className={cn("space-y-3", className)}>
      {TRUST_PROMISES.map(({ icon: Icon, title, text }) => (
        <li key={title} className="flex gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sound-soft text-sound" aria-hidden>
            <Icon className="size-[18px]" weight="duotone" />
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold leading-5">{title}</span>
            <span className="block text-[13px] leading-snug text-muted-foreground">{text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** «¿Por qué es seguro?» → the full, honest explanation. */
export function TrustLink({ className, label = "¿Por qué es seguro? Así funciona" }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 text-[13px] font-medium text-sound underline-offset-4 hover:underline",
          className,
        )}
      >
        <ShieldCheckIcon className="size-4" weight="duotone" />
        {label}
      </button>
      <TrustDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function TrustDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[20px]">
            <ShieldCheckIcon className="size-6 text-sound" weight="duotone" /> Así funciona, sin letra pequeña
          </DialogTitle>
          <DialogDescription>
            Para mandarte stickers con sonido, Estampido se conecta a tu WhatsApp como lo hace WhatsApp Web. Esto es
            exactamente lo que hace y lo que no.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <List
            tone="yes"
            title="Lo que sí hacemos"
            items={[
              "Mandarte a tu chat «Tú» los stickers que tú pides",
              "Conectarnos unos segundos al enviar y desconectarnos",
              "Guardar la conexión cifrada solo en este navegador",
              "Reconocer tu cuenta por los últimos 4 dígitos de tu número",
            ]}
          />
          <List
            tone="no"
            title="Lo que nunca hacemos"
            items={[
              "Leer o guardar tus chats, fotos o contactos",
              "Escribirle a otras personas o grupos",
              "Guardar tu número completo",
              "Quedarnos conectados cuando no envías nada",
            ]}
          />
        </div>

        <Section title="Paso a paso">
          <ol className="space-y-2">
            {[
              "Escribes tu número y te damos un código (o un QR en computadora).",
              "En tu WhatsApp, en «Dispositivos vinculados», escribes ese código. Así le das permiso a Estampido.",
              "Cada vez que tocas «Enviar», nos conectamos, te mandamos el sticker a tu chat «Tú» y nos desconectamos.",
            ].map((t, i) => (
              <li key={t} className="flex gap-2.5">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-[12px] font-semibold text-background">
                  {i + 1}
                </span>
                <span className="pt-0.5 text-muted-foreground">{t}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Preguntas frecuentes">
          <Faq q="¿Por qué parece que «inicio sesión» en una web?">
            Porque WhatsApp no tiene otra forma de que una app te mande stickers con sonido. Es el mismo mecanismo que
            usa WhatsApp Web: un dispositivo vinculado. La diferencia es que Estampido solo lo usa para enviarte a ti.
          </Faq>
          <Faq q="¿Pueden ver mis conversaciones?">
            No las pedimos, no las leemos y no las guardamos. Solo nos conectamos el tiempo justo para enviar y luego
            cerramos la conexión.
          </Faq>
          <Faq q="¿Qué guardan de mí?">
            En el servidor: tu perfil de creador (si publicas) y los últimos 4 dígitos de tu número para reconocer tu
            cuenta. La conexión con tu WhatsApp vive cifrada solo en tu navegador; nosotros no guardamos copia.
          </Faq>
          <Faq q="¿Cómo lo quito?">
            Cuando quieras: «Cerrar sesión» aquí, o en tu teléfono → WhatsApp → Dispositivos vinculados → «Chrome (Mac
            OS)» → Cerrar sesión. Al instante deja de funcionar.
          </Faq>
          <Faq q="¿Es oficial de WhatsApp?">
            No. Es una conexión no oficial, como muchas apps de stickers. Como solo te mandas mensajes a ti, el riesgo de
            problemas con tu cuenta es muy bajo, pero no es cero.
          </Faq>
        </Section>

        <p className="flex items-center gap-2 rounded-2xl bg-muted/60 px-3.5 py-3 text-[13px] text-muted-foreground">
          <LinkBreakIcon className="size-4 shrink-0" />
          <span>
            Más detalle en{" "}
            <Link href={ROUTES.privacy} onClick={() => onOpenChange(false)} className="font-medium text-foreground underline underline-offset-4">
              Privacidad y términos
            </Link>
            .
          </span>
        </p>
      </DialogContent>
    </Dialog>
  );
}

function List({ tone, title, items }: { tone: "yes" | "no"; title: string; items: string[] }) {
  return (
    <div className={cn("rounded-2xl p-3.5 ring-1", tone === "yes" ? "bg-sound-soft/60 ring-sound/25" : "bg-muted/50 ring-border")}>
      <p className="mb-2 text-[13px] font-semibold">{title}</p>
      <ul className="space-y-1.5 text-[13px]">
        {items.map((t) => (
          <li key={t} className="flex gap-2">
            {tone === "yes" ? (
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-sound" weight="bold" />
            ) : (
              <XIcon className="mt-0.5 size-4 shrink-0 text-destructive" weight="bold" />
            )}
            <span className="text-muted-foreground">{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 text-[14px]">
      <h3 className="text-[14px] font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl bg-muted/40 px-3.5 py-2.5 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13.5px] font-medium">
        {q}
        <span className="text-muted-foreground transition-transform group-open:rotate-45" aria-hidden>
          +
        </span>
      </summary>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{children}</p>
    </details>
  );
}
