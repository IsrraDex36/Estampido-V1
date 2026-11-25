import { XIcon } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { TimeInput } from "@/components/time-input";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format";
import { selectBusy, useConverterStore } from "../../store/converterStore";
import { GroupedList, Row, RowText, SwitchListRow } from "../ui/GroupedList";

export function SoundOptions() {
  const { includeAudio, audioStartSec, kind, audioFile, disabled, update, selectAudioFile } = useConverterStore(
    useShallow((s) => ({
      includeAudio: s.options.includeAudio,
      audioStartSec: s.options.audioStartSec,
      kind: s.inputKind,
      audioFile: s.audioFile,
      disabled: selectBusy(s),
      update: s.updateOptions,
      selectAudioFile: s.selectAudioFile,
    })),
  );
  const pickerRef = useRef<HTMLInputElement>(null);
  const hasOwnSound = kind === "video";

  const chooseAudio = (file: File | null) => {
    const error = selectAudioFile(file);
    if (error) toast.error(error);
  };

  return (
    <GroupedList>
      <SwitchListRow
        id="audio"
        title="Con sonido"
        detail="Suena al tocar el sticker."
        checked={includeAudio}
        disabled={disabled}
        onCheckedChange={(v) => update({ includeAudio: v })}
      />
      {includeAudio && (
        <Row>
          <RowText
            title="Sonido"
            detail={audioFile ? "Archivo propio" : hasOwnSound ? "El del video, mismo tramo" : "Elige un audio para que suene"}
          />
          {audioFile ? (
            <Button variant="ghost" size="sm" className="rounded-full" disabled={disabled} onClick={() => chooseAudio(null)}>
              <XIcon data-icon="inline-start" />
              {hasOwnSound ? "Usar el del video" : "Quitar"}
            </Button>
          ) : (
            <Button
              variant={hasOwnSound ? "secondary" : "default"}
              size="sm"
              className="rounded-full"
              disabled={disabled}
              onClick={() => pickerRef.current?.click()}
            >
              {hasOwnSound ? "Usar otro…" : "Elegir audio…"}
            </Button>
          )}
          <input
            ref={pickerRef}
            type="file"
            accept="audio/*,video/*"
            className="hidden"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) chooseAudio(picked);
              e.target.value = "";
            }}
          />
        </Row>
      )}
      {includeAudio && audioFile && (
        <Row>
          <RowText title={<span className="block truncate">{audioFile.name}</span>} detail={formatBytes(audioFile.size)} />
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground" htmlFor="audio-start">
            Empieza en
            <TimeInput
              id="audio-start"
              className="h-9 w-24"
              value={audioStartSec}
              min={0}
              disabled={disabled}
              onValueChange={(v) => update({ audioStartSec: v ?? 0 })}
            />
          </label>
        </Row>
      )}
    </GroupedList>
  );
}
