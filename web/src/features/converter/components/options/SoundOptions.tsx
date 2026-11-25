import { UploadIcon, XIcon } from "@/components/icons";
import { API_LIMITS } from "@contract";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { TimeInput } from "@/components/time-input";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format";
import { useVoiceRecorder } from "../../hooks/useVoiceRecorder";
import { recordingLimitFor } from "../../model/recording";
import { selectBusy, useConverterStore } from "../../store/converterStore";
import { CommunitySoundPicker } from "./CommunitySoundPicker";
import { RecordButton, RecordingPanel } from "./VoiceRecorder";
import { GroupedList, Row, RowText, SwitchListRow } from "../ui/GroupedList";

export function SoundOptions() {
  const { includeAudio, audioStartSec, kind, audioFile, communitySound, disabled, update, selectAudioFile } = useConverterStore(
    useShallow((s) => ({
      includeAudio: s.options.includeAudio,
      audioStartSec: s.options.audioStartSec,
      kind: s.inputKind,
      audioFile: s.audioFile,
      communitySound: s.communitySound,
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

  const maxRecordSec = recordingLimitFor(kind, API_LIMITS.maxImageAudioSec);
  const recorder = useVoiceRecorder({
    maxSec: maxRecordSec,
    onDone: (file) => {
      chooseAudio(file);
      toast.success("Grabación lista: será el sonido del sticker.");
    },
  });
  const recording = recorder.state.kind === "recording";
  useEffect(() => {
    if (recorder.state.kind === "error") {
      toast.error(recorder.state.message);
      recorder.reset();
    }
  }, [recorder]);

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
            detail={
              communitySound && audioFile
                ? `De la comunidad · «${communitySound.title}»`
                : audioFile
                  ? audioFile.name.startsWith("Grabación")
                    ? "Tu grabación"
                    : "Archivo propio"
                  : hasOwnSound
                    ? "El del video, mismo tramo. O cámbialo:"
                    : "Elige de dónde sale el sonido:"
            }
          />
          {audioFile && (
            <Button variant="ghost" size="sm" className="rounded-full" disabled={disabled} onClick={() => chooseAudio(null)}>
              <XIcon data-icon="inline-start" />
              {hasOwnSound ? "Usar el del video" : "Quitar"}
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
      {includeAudio && !audioFile && !recording && (
        <div className="grid grid-cols-3 gap-2 px-4 pb-4">
          <RecordButton recorder={recorder} disabled={disabled} className="w-full" />
          <CommunitySoundPicker disabled={disabled} />
          <Button
            variant="secondary"
            size="sm"
            className="w-full rounded-full"
            disabled={disabled}
            onClick={() => pickerRef.current?.click()}
          >
            <UploadIcon data-icon="inline-start" />
            Archivo
          </Button>
        </div>
      )}
      {includeAudio && recording && (
        <div className="px-4 pb-4">
          <RecordingPanel recorder={recorder} maxSec={maxRecordSec} />
        </div>
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
