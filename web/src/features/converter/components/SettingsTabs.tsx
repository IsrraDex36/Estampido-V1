import type { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { VolumeXIcon } from "@/components/icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useConverterStore } from "../store/converterStore";
import { PackOptions } from "./options/PackOptions";
import { SoundOptions } from "./options/SoundOptions";
import { StyleOptions } from "./options/StyleOptions";
import { SegmentControls } from "./segment/SegmentControls";
import { useSegment } from "./segment/useSegment";
import { SETTINGS_TABS, type TabId } from "./settingsTabList";

const CONTENT: Record<TabId, ReactNode> = {
  time: <SegmentControls />,
  sound: <SoundOptions />,
  style: <StyleOptions />,
  pack: <PackOptions />,
};

/** One-glance value under each tab, so the choices are visible without opening them. */
function useTabSummaries(): { values: Record<TabId, string>; attention: Partial<Record<TabId, boolean>>; muted: boolean } {
  const s = useConverterStore(
    useShallow((st) => ({
      includeAudio: st.options.includeAudio,
      durationSec: st.options.durationSec,
      fit: st.options.fit,
      hq: st.options.hq === true,
      includeMetadata: st.options.includeMetadata,
      packName: st.options.packName,
      kind: st.inputKind,
      audioName: st.audioFile?.name ?? null,
      community: Boolean(st.communitySound),
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
  return {
    values: {
      time,
      sound,
      style: `${s.fit === "pad" ? "Completo" : "Llenar"}${s.hq ? " · HQ" : ""}`,
      pack: s.includeMetadata ? s.packName?.trim() || "Estampido" : "Sin datos",
    },
    attention: { sound: needsSound, style: s.hq },
    muted: !s.includeAudio,
  };
}

/** Apple-style segmented control: icon + name + current value; a dot marks tabs that need attention. */
export function SettingsTabs() {
  const { values, attention, muted } = useTabSummaries();

  return (
    <Tabs defaultValue="time" className="gap-5">
      <TabsList className="grid h-auto w-full grid-cols-4 gap-1 rounded-2xl bg-muted p-1 group-data-horizontal/tabs:h-auto">
        {SETTINGS_TABS.map((t) => (
          <TabsTrigger
            key={t.value}
            value={t.value}
            className="relative h-auto min-w-0 flex-col gap-0.5 rounded-xl px-1 py-2 data-[state=active]:shadow-sm"
          >
            <span className="flex items-center gap-1.5 text-[13px] font-medium [&_svg]:size-4">
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
      {SETTINGS_TABS.map((t) => (
        <TabsContent key={t.value} value={t.value}>
          {CONTENT[t.value]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
