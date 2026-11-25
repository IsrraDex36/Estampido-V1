import { ClockIcon, PackageIcon, PaletteIcon, Volume2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ConverterOptions, InputKind } from "../types";
import { PackOptions } from "./options/PackOptions";
import { SoundOptions } from "./options/SoundOptions";
import { StyleOptions } from "./options/StyleOptions";
import { SegmentControls } from "./SegmentControls";

interface OptionsTabsProps {
  options: ConverterOptions;
  inputKind: InputKind;
  disabled?: boolean;
  currentTime?: number;
  sourceDuration?: number;
  audioFile: File | null;
  onChange: (patch: Partial<ConverterOptions>) => void;
  onAudioFileChange: (file: File | null) => void;
}

/** Settings grouped by intent; a dot flags tabs that need attention. */
export function OptionsTabs(props: OptionsTabsProps) {
  const { options, inputKind, audioFile } = props;
  const needsSound = options.includeAudio && inputKind !== "video" && !audioFile;

  return (
    <Tabs defaultValue="time" className="gap-4">
      <TabsList className="grid w-full grid-cols-4">
        <Tab value="time" icon={<ClockIcon />} label="Tiempo" />
        <Tab value="sound" icon={<Volume2Icon />} label="Sonido" dot={needsSound} />
        <Tab value="style" icon={<PaletteIcon />} label="Estilo" dot={options.hq === true} />
        <Tab value="pack" icon={<PackageIcon />} label="Pack" />
      </TabsList>

      <TabsContent value="time">
        <SegmentControls
          options={options}
          inputKind={inputKind}
          disabled={props.disabled}
          currentTime={props.currentTime}
          sourceDuration={props.sourceDuration}
          onChange={props.onChange}
        />
      </TabsContent>
      <TabsContent value="sound">
        <SoundOptions
          options={options}
          inputKind={inputKind}
          audioFile={audioFile}
          disabled={props.disabled}
          onChange={props.onChange}
          onAudioFileChange={props.onAudioFileChange}
        />
      </TabsContent>
      <TabsContent value="style">
        <StyleOptions options={options} inputKind={inputKind} disabled={props.disabled} onChange={props.onChange} />
      </TabsContent>
      <TabsContent value="pack">
        <PackOptions options={options} disabled={props.disabled} onChange={props.onChange} />
      </TabsContent>
    </Tabs>
  );
}

function Tab({ value, icon, label, dot }: { value: string; icon: ReactNode; label: string; dot?: boolean }) {
  return (
    <TabsTrigger value={value} className="relative gap-1.5 [&_svg]:size-3.5">
      {icon}
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
      {dot && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" aria-hidden />}
    </TabsTrigger>
  );
}
