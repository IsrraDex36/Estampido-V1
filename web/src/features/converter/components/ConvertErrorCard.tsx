import { useEffect, useRef, useState } from "react";
import { CircleAlertIcon, Loader2Icon, TimerIcon, TriangleAlertIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { FeedbackDialog } from "@/features/feedback/LazyFeedbackDialog";
import { cn } from "@/lib/utils";
import { describeFailure, type FailureAction, type FailureTone } from "../model/failure";
import { useConverterStore } from "../store/converterStore";
import type { ConvertFailure } from "../types";

const TONE: Record<FailureTone, { ring: string; tile: string; icon: React.ReactNode }> = {
  busy: { ring: "ring-retro-a/40", tile: "bg-retro-a/15 text-retro-a", icon: <TimerIcon className="size-5" /> },
  file: { ring: "ring-border", tile: "bg-muted text-foreground", icon: <TriangleAlertIcon className="size-5" /> },
  connection: { ring: "ring-border", tile: "bg-muted text-foreground", icon: <CircleAlertIcon className="size-5" /> },
  error: { ring: "ring-destructive/40", tile: "bg-destructive/15 text-destructive", icon: <CircleAlertIcon className="size-5" /> },
};

/** Busy: retry by itself up to this many times, then leave it to the person. */
const MAX_AUTO_RETRIES = 6;

/**
 * Why the sticker couldn't be created, and what to do now — not just red text.
 * Busy answers count down and retry on their own.
 */
export function ConvertErrorCard({ failure }: { failure: ConvertFailure }) {
  const hq = useConverterStore((s) => s.options.hq === true);
  const convert = useConverterStore((s) => s.convert);
  const autoRetries = useConverterStore((s) => s.autoRetries);
  const update = useConverterStore((s) => s.updateOptions);
  const selectFile = useConverterStore((s) => s.selectFile);
  const view = describeFailure(failure, { hq });
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const tone = TONE[view.tone];

  const auto = view.autoRetrySec !== undefined && autoRetries < MAX_AUTO_RETRIES ? view.autoRetrySec : null;
  const left = useCountdown(auto, () => void convert({ auto: true }));

  const run: Record<FailureAction, { label: string; onClick: () => void }> = {
    retry: { label: left !== null ? "Reintentar ahora" : "Reintentar", onClick: () => void convert() },
    choose_file: { label: "Elegir otro archivo", onClick: () => selectFile(null) },
    shorter: {
      label: "Probar con 5 s",
      onClick: () => {
        update({ durationSec: 5 });
        void convert();
      },
    },
    no_hq: {
      label: "Sin calidad alta",
      onClick: () => {
        update({ hq: false });
        void convert();
      },
    },
    feedback: { label: "Contarnos qué pasó", onClick: () => setFeedbackOpen(true) },
  };

  return (
    <section role="alert" aria-live="assertive" className={cn("space-y-3 rounded-3xl bg-muted/40 p-4 ring-1", tone.ring)}>
      <div className="flex gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-2xl", tone.tile)} aria-hidden>
          {tone.icon}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[15px] leading-tight font-semibold">{view.title}</p>
          <p className="text-[13px] leading-snug text-muted-foreground">{view.body}</p>
        </div>
      </div>

      {left !== null && (
        <div className="flex items-center gap-2 rounded-2xl bg-background/60 px-3 py-2 text-[13px]" role="status">
          <Loader2Icon className="size-4 animate-spin text-retro-a" />
          <span>
            Reintentando en <b className="tabular-nums">{left} s</b>…
          </span>
        </div>
      )}

      {view.tips.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-muted-foreground">
          {view.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {view.actions.map((a, i) => (
          <Button
            key={a}
            size="sm"
            variant={i === 0 ? "default" : "secondary"}
            className="rounded-full"
            onClick={run[a].onClick}
          >
            {run[a].label}
          </Button>
        ))}
        {failure.status > 0 && (
          <span className="ml-auto font-mono text-[11px] text-muted-foreground" title="Para soporte">
            Error {failure.status}
          </span>
        )}
      </div>
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </section>
  );
}

/**
 * Seconds left until `onDone` fires (null = no countdown). The deadline is
 * fixed when the card mounts (the card is keyed per attempt).
 */
function useCountdown(from: number | null, onDone: () => void): number | null {
  const [deadline] = useState(() => (from === null ? null : Date.now() + from * 1000));
  const [now, setNow] = useState(() => Date.now());
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (deadline === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= deadline) {
        clearInterval(id);
        done.current();
      }
    }, 250);
    return () => clearInterval(id);
  }, [deadline]);
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
}
