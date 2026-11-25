import type { ConvertResponse } from "@contract";
import * as m from "motion/react-m";
import { type ReactNode, useEffect, useState } from "react";
import { ArrowUpIcon, SparklesIcon, TimerIcon, Volume2Icon, VolumeXIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useStickerPlayer } from "../../hooks/useStickerPlayer";
import { PlayerBar } from "./PlayerBar";
import { ResultActions } from "./ResultActions";
import { ResultDetails } from "./ResultDetails";
import { ResultLayout } from "./ResultLayout";
import { ResultNotes } from "./ResultNotes";
import { StickerStage } from "./StickerStage";

/** Finished sticker: headline, player, WhatsApp + actions, notes, specs. */
export function ResultView({ result }: { result: ConvertResponse }) {
  const player = useStickerPlayer(result.sticker.url, result.audio?.url ?? null);
  return (
    <ResultLayout stage={<StickerStage player={player} />}>
      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.05, ease: [0.2, 0, 0, 1] }}
        className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:gap-8 3xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]"
      >
        <div className="space-y-5">
          <Headline result={result} />
          <PlayerBar player={player} fallbackDuration={result.audio?.durationSec ?? 0} />
          <ResultActions result={result} />
          <ResultNotes warnings={result.warnings} />
        </div>
        <div className="space-y-3">
          <ResultDetails result={result} />
          <Expiry expiresAt={result.expiresAt} />
          <Button
            variant="ghost"
            className="w-full rounded-full text-muted-foreground"
            onClick={() => document.getElementById("sec-01")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            <ArrowUpIcon data-icon="inline-start" />
            Hacer otro con otros ajustes
          </Button>
        </div>
      </m.div>
    </ResultLayout>
  );
}

/** «¡Listo!» + the three facts people care about. */
function Headline({ result }: { result: ConvertResponse }) {
  const { sticker, audio } = result;
  const chips: { key: string; label: ReactNode }[] = [
    {
      key: "sound",
      label: audio ? (
        <>
          <Volume2Icon className="size-3.5 text-sound" /> {formatTime(audio.durationSec)}
        </>
      ) : (
        <>
          <VolumeXIcon className="size-3.5" /> Sin sonido
        </>
      ),
    },
    { key: "fps", label: sticker.animated ? `${sticker.fps} fps` : "Estático" },
    { key: "size", label: formatBytes(sticker.bytes) },
  ];
  return (
    <div className="space-y-2">
      <m.p
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 24 }}
        className="flex items-center gap-2 text-2xl font-semibold tracking-tight"
      >
        <SparklesIcon className="size-6 text-sound" weight="fill" />
        ¡Tu sticker está listo!
      </m.p>
      <ul className="flex flex-wrap gap-1.5" aria-label="Resumen">
        {chips.map((c) => (
          <li key={c.key} className="flex items-center gap-1 rounded-full bg-muted/70 px-2.5 py-1 text-[12px] font-medium tabular-nums">
            {c.label}
          </li>
        ))}
        {!sticker.withinLimit && (
          <li className="rounded-full bg-destructive/15 px-2.5 py-1 text-[12px] font-medium text-destructive">Supera 500 KB</li>
        )}
      </ul>
    </div>
  );
}

/** "Disponible hasta 14:30 · quedan 27 min", warns in the last 5. */
function Expiry({ expiresAt }: { expiresAt: string }) {
  const end = Date.parse(expiresAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.round((end - now) / 60_000));
  const soon = left <= 5;
  return (
    <p
      className={cn(
        "flex items-center justify-center gap-1.5 text-[12px] xl:justify-start",
        soon ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <TimerIcon className="size-3.5" />
      Disponible hasta las {new Date(end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      <span className="tabular-nums">· {left > 0 ? `quedan ${left} min` : "a punto de borrarse"}</span>
    </p>
  );
}
