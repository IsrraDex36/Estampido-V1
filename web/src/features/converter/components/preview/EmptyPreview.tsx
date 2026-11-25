import { PlayIcon, SendIcon, SparklesIcon, TimerIcon, Volume2Icon } from "@/components/icons";
import type { ReactNode } from "react";

const STEPS = [
  ["Elige tu clip", "Video, GIF o imagen. Marca el tramo que suena mejor."],
  ["Ajusta", "Encuadre, sonido y calidad. Lo de siempre ya viene listo."],
  ["Crea y envía", "Escúchalo aquí y mándalo a WhatsApp con su sonido."],
] as const;

const TIPS = [
  { icon: TimerIcon, text: "Tramos de 3–6 s se ven más fluidos." },
  { icon: Volume2Icon, text: "El sonido se nivela solo si está bajito." },
  { icon: SparklesIcon, text: "Clip largo: prueba «Calidad alta» en Estilo." },
] as const;

/**
 * Empty result, right side: the three steps plus a ghost of what will appear
 * here (player, send, spec sheet) so the area reads as "coming", not "missing".
 */
export function EmptyPreview() {
  return (
    <div className="hidden h-full flex-col gap-6 md:flex" aria-hidden>
      <ol className="grid grid-cols-3 gap-3">
        {STEPS.map(([title, text], i) => (
          <li key={title} className="rounded-2xl bg-muted/50 p-4">
            <p className="font-pixel text-[10px] text-muted-foreground">0{i + 1}</p>
            <p className="mt-2 font-semibold tracking-tight">{title}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">{text}</p>
          </li>
        ))}
      </ol>

      <div className="grid flex-1 gap-6 opacity-60 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:gap-8 3xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full border border-dashed border-foreground/25 text-muted-foreground">
              <PlayIcon className="size-4 translate-x-px" />
            </span>
            <span className="h-1 flex-1 rounded-full bg-muted" />
            <span className="w-20 text-right font-mono text-[13px] text-muted-foreground tabular-nums">0:00</span>
          </div>
          <div className="flex h-12 items-center justify-center gap-2 rounded-full border border-dashed border-foreground/25 text-[14px] font-medium text-muted-foreground">
            <SendIcon className="size-4" />
            Enviar a WhatsApp
          </div>
        </div>
        <dl className="hidden divide-y divide-border rounded-2xl border border-dashed xl:block border-foreground/15 px-4 text-[13px]">
          <Ghost label="Tamaño">— de 500 KB</Ghost>
          <Ghost label="Imagen">— fps</Ghost>
          <Ghost label="Sonido">—</Ghost>
          <Ghost label="Origen">—</Ghost>
        </dl>
      </div>

      <ul className="mt-auto flex flex-wrap gap-x-6 gap-y-2 text-[12px] text-muted-foreground">
        {TIPS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-2">
            <Icon className="size-4 text-sound" weight="duotone" />
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Ghost({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-muted-foreground tabular-nums">{children}</dd>
    </div>
  );
}
