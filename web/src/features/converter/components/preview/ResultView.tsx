import type { ConvertResponse } from "@contract";
import * as m from "motion/react-m";
import { type ReactNode, useEffect, useState } from "react";
import {
  ArrowUpIcon,
  FrameIcon,
  MicIcon,
  SparklesIcon,
  TextIcon,
  TimerIcon,
  TriangleAlertIcon,
  Volume2Icon,
  VolumeXIcon,
} from "@/components/icons";
import { formatBytes } from "@/lib/format";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useStickerPlayer } from "../../hooks/useStickerPlayer";
import { LOOK_LABELS } from "../../model/look";
import { VOICE_EMOJI, VOICE_LABELS } from "../../model/voice";
import { type SettingsTabId, useConverterStore } from "../../store/converterStore";
import { PlayerBar } from "./PlayerBar";
import { ResultActions } from "./ResultActions";
import { ResultDetails } from "./ResultDetails";
import { ResultLayout } from "./ResultLayout";
import { ResultNotes } from "./ResultNotes";
import { StickerStage } from "./StickerStage";

/** Finished sticker: headline, player, WhatsApp + actions, notes, specs. */
export function ResultView({ result }: { result: ConvertResponse }) {
  const player = useStickerPlayer(result.audio?.url ?? null);
  return (
    <ResultLayout stage={<StickerStage player={player} stickerUrl={result.sticker.url} />}>
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
          <TweakAndRedo />
        </div>
      </m.div>
    </ResultLayout>
  );
}

/** «¡Listo!» + the three facts people care about. */
function Headline({ result }: { result: ConvertResponse }) {
  const { sticker, audio } = result;
  const a = useConverterStore((s) => s.resultApplied);
  // What you added on top (so it's clear it made it into the sticker).
  const applied = [
    a?.text ? "Con texto" : null,
    a?.voice ? `${VOICE_EMOJI[a.voice]} ${VOICE_LABELS[a.voice]}` : null,
    a?.look ? `Filtro ${LOOK_LABELS[a.look]}` : null,
    a?.flip ? "Espejo" : null,
  ].filter((x): x is string => x !== null);
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
        {applied.map((label) => (
          <li key={label} className="flex items-center gap-1 rounded-full bg-sound/12 px-2.5 py-1 text-[12px] font-medium text-sound">
            {label}
          </li>
        ))}
        {chips.map((c) => (
          <li key={c.key} className="flex items-center gap-1 rounded-full bg-muted/70 px-2.5 py-1 text-[12px] font-medium tabular-nums">
            {c.label}
          </li>
        ))}
        {result.whatsapp && !result.whatsapp.ok && (
          <li className="flex items-center gap-1 rounded-full bg-retro-a/15 px-2.5 py-1 text-[12px] font-medium text-retro-a">
            <TriangleAlertIcon className="size-3.5" weight="fill" /> Revisa antes de enviar
          </li>
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

const TWEAKS: { tab: SettingsTabId; label: string; Icon: typeof TextIcon }[] = [
  { tab: "text", label: "Texto", Icon: TextIcon },
  { tab: "sound", label: "Voz", Icon: MicIcon },
  { tab: "style", label: "Estilo", Icon: FrameIcon },
  { tab: "time", label: "Tramo", Icon: TimerIcon },
];

/** «Ajusta y vuelve a crear»: opens the right settings tab and scrolls to it. */
function TweakAndRedo() {
  const setTab = useConverterStore((s) => s.setSettingsTab);
  const go = (tab: SettingsTabId) => {
    setTab(tab);
    document.getElementById("sec-02")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <div className="space-y-2 rounded-2xl bg-muted/40 p-3">
      <p className="text-[13px] font-medium">Ajusta y vuelve a crear</p>
      <div className="grid grid-cols-4 gap-1.5">
        {TWEAKS.map(({ tab, label, Icon }) => (
          <button
            key={tab}
            type="button"
            onClick={() => go(tab)}
            className="flex flex-col items-center gap-1 rounded-xl bg-background/70 px-1 py-2 text-[12px] font-medium ring-1 ring-border/60 transition-colors hover:bg-background"
          >
            <Icon className="size-[18px] text-muted-foreground" />
            {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => document.getElementById("sec-01")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        className="flex w-full items-center justify-center gap-1.5 pt-1 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ArrowUpIcon className="size-3.5" /> O usa otro clip
      </button>
    </div>
  );
}
