import { useState } from "react";
import { Link } from "wouter";
import { ROUTES } from "@/app/routes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { REPORT_HIDE_THRESHOLD } from "@contract";

const RULES = [
  { emoji: "🎤", title: "Publica lo tuyo", body: "Sonidos y clips propios o con permiso. Nada robado de otros creadores." },
  { emoji: "🤝", title: "Con respeto", body: "Nada de odio, acoso, violencia ni contenido sexual. Es para reír, no para lastimar." },
  { emoji: "🚫", title: "Sin spam", body: "Ni publicidad, ni el mismo sticker repetido muchas veces." },
  {
    emoji: "🚩",
    title: "Reporta lo que no cuadre",
    body: `Menú ⋯ → Reportar. Con ${REPORT_HIDE_THRESHOLD} reportes se oculta mientras lo revisamos; quien rompe las reglas puede quedar bloqueado.`,
  },
] as const;

/** «Reglas»: four short rules, how reporting works, link to the full terms. */
export function CommunityRulesButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" className={className} onClick={() => setOpen(true)}>
        Reglas de la comunidad
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reglas de la comunidad</DialogTitle>
            <DialogDescription>Cortas y claras, para que sea un buen lugar para todos.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-3">
            {RULES.map((r) => (
              <li key={r.title} className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-lg" aria-hidden>
                  {r.emoji}
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold">{r.title}</span>
                  <span className="block text-[13px] leading-snug text-muted-foreground">{r.body}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-muted-foreground">
            Detalles en{" "}
            <Link href={ROUTES.privacy} onClick={() => setOpen(false)} className="underline underline-offset-2">
              Privacidad y términos
            </Link>
            .
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
