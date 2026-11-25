import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConverterStore } from "../store/converterStore";
import { PackOptions } from "./options/PackOptions";
import { SoundOptions } from "./options/SoundOptions";
import { StyleOptions } from "./options/StyleOptions";
import { SegmentControls } from "./segment/SegmentControls";

const TABS = [
  { value: "time", label: "Tiempo", content: <SegmentControls /> },
  { value: "sound", label: "Sonido", content: <SoundOptions /> },
  { value: "style", label: "Estilo", content: <StyleOptions /> },
  { value: "pack", label: "Pack", content: <PackOptions /> },
] as const;

/** Apple-style segmented control; a dot marks tabs that need attention. */
export function SettingsTabs() {
  const needsSound = useConverterStore((s) => s.options.includeAudio && s.inputKind !== "video" && !s.audioFile);
  const hq = useConverterStore((s) => s.options.hq === true);
  const dots: Record<string, boolean> = { sound: needsSound, style: hq };

  return (
    <Tabs defaultValue="time" className="gap-5">
      <TabsList className="grid h-10 w-full grid-cols-4 rounded-full bg-muted p-1">
        {TABS.map((t) => (
          <TabsTrigger
            key={t.value}
            value={t.value}
            className="relative rounded-full text-[13px] font-medium data-[state=active]:shadow-sm"
          >
            {t.label}
            {dots[t.value] && <span className="absolute top-1.5 right-2 size-1.5 rounded-full bg-sound" aria-label="requiere atención" />}
          </TabsTrigger>
        ))}
      </TabsList>
      {TABS.map((t) => (
        <TabsContent key={t.value} value={t.value}>
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
