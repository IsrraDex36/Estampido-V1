import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { useRef } from "react";
import { EmptyStage } from "../components/preview/Stage";
import { ProcessingStage } from "../components/preview/ProcessingStage";
import { ResultSkeleton } from "../components/preview/ResultSkeleton";
import { ResultLayout } from "../components/preview/ResultLayout";
import { ResultView } from "../components/preview/ResultView";
import { useRevealOnDone } from "../hooks/useRevealOnDone";
import { selectBusy, selectResult, useConverterStore } from "../store/converterStore";
import { Section } from "./Section";

export function ResultSection({ className }: { className?: string }) {
  const result = useConverterStore(selectResult);
  const busy = useConverterStore(selectBusy);
  const ref = useRef<HTMLDivElement>(null);
  useRevealOnDone(ref);

  const key = result ? result.id : busy ? "busy" : "empty";
  return (
    <div ref={ref} className={className}>
      <Section index="03" title="Resultado">
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {result ? (
              <ResultView result={result} />
            ) : busy ? (
              <ResultLayout stage={<ProcessingStage />}>
                <ResultSkeleton />
              </ResultLayout>
            ) : (
              <ResultLayout stage={<EmptyStage />}>
                <EmptySteps />
              </ResultLayout>
            )}
          </m.div>
        </AnimatePresence>
      </Section>
    </div>
  );
}

const STEPS = [
  ["Elige tu clip", "Video, GIF o imagen. Marca el tramo que suena mejor."],
  ["Ajusta", "Encuadre, sonido y calidad. Lo de siempre ya viene listo."],
  ["Crea y envía", "Escúchalo aquí y mándalo a WhatsApp con su sonido."],
] as const;

/** What the result area will hold, while empty. */
function EmptySteps() {
  return (
    <ol className="hidden gap-3 md:grid xl:grid-cols-3">
      {STEPS.map(([title, text], i) => (
        <li key={title} className="rounded-2xl bg-muted/50 p-4">
          <p className="font-pixel text-[10px] text-muted-foreground">0{i + 1}</p>
          <p className="mt-2 font-semibold tracking-tight">{title}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{text}</p>
        </li>
      ))}
    </ol>
  );
}
