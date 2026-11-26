import { type ReactNode, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { VolumeXIcon } from "@/components/icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useConverterStore } from "../store/converterStore";
import { PackOptions } from "./options/PackOptions";
import { SoundOptions } from "./options/SoundOptions";
import { StyleOptions } from "./options/StyleOptions";
import { TextOptions } from "./options/TextOptions";
import { SegmentControls } from "./segment/SegmentControls";
import { useSegment } from "./segment/useSegment";
import { SETTINGS_TABS, type TabId } from "./settingsTabList";
import { VOICE_LABELS } from "../model/voice";

const CONTENT: Record<TabId, ReactNode> = {
  time: <SegmentControls />,
  sound: <SoundOptions />,
  style: <StyleOptions />,
  text: <TextOptions />,
  pack: <PackOptions />,
};

/** One-glance value under each tab, so the choices are visible without opening them. */
function useTabSummaries(): { values: Record<TabId, string>; attention: Partial<Record<TabId, boolean>>; muted: boolean } {
  const s = useConverterStore(
    useShallow((st) => ({
      includeAudio: st.options.includeAudio,
      durationSec: st.options.durationSec,
      fit: st.options.fit,
      background: st.options.background ?? "transparent",
      hq: st.options.hq === true,
      includeMetadata: st.options.includeMetadata,
      packName: st.options.packName,
      kind: st.inputKind,
      audioName: st.audioFile?.name ?? null,
      community: Boolean(st.communitySound),
      voice: st.options.voice,
      textTop: st.text.top.trim(),
      textBottom: st.text.bottom.trim(),
    })),
  );
  const seg = useSegment();
  const needsSound = s.includeAudio && s.kind !== "video" && !s.audioName;
  const time = seg.isImage && s.durationSec === undefined ? "Auto" : formatTime(seg.effective ?? seg.requested ?? 0);
  const sound = !s.includeAudio
    ? "Sin sonido"
    : s.audioName
      ? s.community
        ? "Comunidad"
        : s.audioName.startsWith("Grabación")
          ? "Tu voz"
          : "Archivo"
      : s.kind === "video"
        ? "Del video"
        : "Elige uno";
  const textValue = s.textTop && s.textBottom ? "2 textos" : s.textTop || s.textBottom ? "Con texto" : "Sin texto";
  const voiceLabel = s.includeAudio && s.voice ? ` · ${VOICE_LABELS[s.voice]}` : "";
  return {
    values: {
      time,
      sound: `${sound}${voiceLabel}`,
      text: textValue,
      style: `${s.fit === "crop" ? "Llenar" : s.background === "blur" ? "Desenfoque" : s.background === "transparent" ? "Completo" : "Color"}${s.hq ? " · HQ" : ""}`,
      pack: s.includeMetadata ? s.packName?.trim() || "Estampido" : "Sin datos",
    },
    attention: { sound: needsSound, style: s.hq },
    muted: !s.includeAudio,
  };
}

/** Controls that already use horizontal drags: a swipe there must not change the tab. */
const NO_SWIPE = '[role="slider"], input, textarea, select, .touch-none, [data-no-swipe]';
const ORDER = SETTINGS_TABS.map((t) => t.value);

/** A tiny tick on phones that support it (never with reduced motion). */
function tick() {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  navigator.vibrate(8);
}

/**
 * Horizontal swipe on the panel → previous / next tab (phones). Only clear
 * horizontal gestures count, so vertical scrolling and draggable controls
 * (trimmer, framing, sliders) keep working.
 */
function useSwipeTabs(tab: TabId, setTab: (t: TabId) => void, onSwiped: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      start.current =
        t && e.touches.length === 1 && !(e.target as Element).closest(NO_SWIPE) ? { x: t.clientX, y: t.clientY } : null;
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const t = e.changedTouches[0];
      const s = start.current;
      start.current = null;
      if (!s || !t) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
      const next = ORDER[ORDER.indexOf(tab) + (dx < 0 ? 1 : -1)];
      if (next) {
        tick();
        setTab(next);
        onSwiped();
      }
    },
  };
}

const HINT_KEY = "estampido-swipe-learned";
const learned = () => {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
};

/** Apple-style segmented control: icon + name + current value; a dot marks tabs that need attention. */
export function SettingsTabs() {
  const { values, attention, muted } = useTabSummaries();
  const [tab, setTab] = useState<TabId>("time");
  // The «desliza» hint shows until the first swipe, then never again.
  const [showHint, setShowHint] = useState(() => !learned());
  const swipe = useSwipeTabs(tab, setTab, () => {
    setShowHint(false);
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      // private mode: the hint just comes back next visit
    }
  });

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => {
        tick();
        setTab(v as TabId);
      }}
      className="flex-1 gap-5"
    >
      <TabsList className="grid h-auto w-full grid-cols-5 gap-1 rounded-2xl bg-muted p-1 group-data-horizontal/tabs:h-auto">
        {SETTINGS_TABS.map((t) => (
          <TabsTrigger
            key={t.value}
            value={t.value}
            className="relative h-auto min-w-0 flex-col gap-0.5 rounded-xl px-1 py-2 data-[state=active]:shadow-sm sm:px-1.5"
          >
            {/* Phones: icon on top (more room for words); wider: icon beside the name. */}
            <span className="flex flex-col items-center gap-0.5 text-[12px] font-medium sm:flex-row sm:gap-1.5 sm:text-[13px] [&_svg]:size-[18px] sm:[&_svg]:size-4">
              {t.value === "sound" && muted ? <VolumeXIcon /> : t.icon}
              {t.label}
            </span>
            <span
              className={cn(
                "max-w-full truncate text-[11px] font-normal text-muted-foreground",
                attention[t.value] && t.value === "sound" && "text-sound",
              )}
            >
              {values[t.value]}
            </span>
            {attention[t.value] && (
              <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-sound" aria-label="requiere atención" />
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      <div {...swipe} className="flex flex-col">
        {SETTINGS_TABS.map((t) => (
          <TabsContent
            key={t.value}
            value={t.value}
            className="flex flex-col duration-200 data-[state=active]:animate-in data-[state=active]:fade-in-0 motion-reduce:animate-none"
          >
            {CONTENT[t.value]}
          </TabsContent>
        ))}
      </div>
      {showHint && (
        <p className="-mt-2 text-center text-[11px] text-muted-foreground sm:hidden" aria-hidden>
          ← Desliza para cambiar de pestaña →
        </p>
      )}
    </Tabs>
  );
}
