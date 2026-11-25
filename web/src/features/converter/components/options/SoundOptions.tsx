import { FileAudioIcon, MusicIcon, Volume2Icon, XIcon } from "lucide-react";
import { useRef } from "react";
import { TimeInput } from "@/components/time-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatBytes } from "@/lib/format";
import type { ConverterOptions, InputKind } from "../../types";
import { SwitchRow } from "./OptionRow";

interface SoundOptionsProps {
  options: ConverterOptions;
  inputKind: InputKind;
  audioFile: File | null;
  disabled?: boolean;
  onChange: (patch: Partial<ConverterOptions>) => void;
  onAudioFileChange: (file: File | null) => void;
}

export function SoundOptions({ options, inputKind, audioFile, disabled, onChange, onAudioFileChange }: SoundOptionsProps) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const hasOwnSound = inputKind === "video";

  return (
    <div className="space-y-3">
      <SwitchRow
        id="audio"
        icon={<Volume2Icon />}
        title="Sticker con sonido"
        description="Suena al tocarlo. Se guarda en Opus, el formato de las notas de voz."
        checked={options.includeAudio}
        disabled={disabled}
        onCheckedChange={(includeAudio) => onChange({ includeAudio })}
      />

      {options.includeAudio && (
        <div className="space-y-3 rounded-xl border border-dashed p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 text-sm">
              <p className="font-medium">Origen del sonido</p>
              <p className="text-xs text-muted-foreground">
                {audioFile
                  ? "Archivo propio"
                  : hasOwnSound
                    ? "El audio del propio video (mismo tramo)"
                    : "Este archivo no tiene sonido: elige uno"}
              </p>
            </div>
            {audioFile ? (
              <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onAudioFileChange(null)}>
                <XIcon data-icon="inline-start" />
                {hasOwnSound ? "Usar el del video" : "Quitar"}
              </Button>
            ) : (
              <Button
                variant={hasOwnSound ? "outline" : "default"}
                size="sm"
                disabled={disabled}
                onClick={() => pickerRef.current?.click()}
              >
                <MusicIcon data-icon="inline-start" />
                {hasOwnSound ? "Usar otro audio…" : "Elegir audio…"}
              </Button>
            )}
            <input
              ref={pickerRef}
              type="file"
              accept="audio/*,video/*"
              className="hidden"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) onAudioFileChange(picked);
                e.target.value = "";
              }}
            />
          </div>

          {audioFile && (
            <div className="grid gap-3 sm:grid-cols-[1fr_9rem] sm:items-end">
              <div className="flex min-w-0 items-center gap-2.5 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                <FileAudioIcon className="size-4 shrink-0 text-primary" />
                <span className="truncate">{audioFile.name}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{formatBytes(audioFile.size)}</span>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="audio-start" className="text-xs text-muted-foreground">
                  Empieza en (m:ss)
                </Label>
                <TimeInput
                  id="audio-start"
                  value={options.audioStartSec}
                  min={0}
                  disabled={disabled}
                  onValueChange={(v) => onChange({ audioStartSec: v ?? 0 })}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
