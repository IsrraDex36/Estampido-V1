import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { useRef } from "react";
import { EmptyStage } from "../components/preview/Stage";
import { EmptyPreview } from "../components/preview/EmptyPreview";
import { ProcessingStage } from "../components/preview/ProcessingStage";
import { ResultSkeleton } from "../components/preview/ResultSkeleton";
import { ResultLayout } from "../components/preview/ResultLayout";
import { ResultView } from "../components/preview/ResultView";
import { useRevealOnDone } from "../hooks/useRevealOnDone";
import { selectBusy, selectResult, useConverterStore } from "../store/converterStore";
import { Section } from "@/components/section";

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
              <ResultLayout stage={<EmptyStage />} stretch>
                <EmptyPreview />
              </ResultLayout>
            )}
          </m.div>
        </AnimatePresence>
      </Section>
    </div>
  );
}

