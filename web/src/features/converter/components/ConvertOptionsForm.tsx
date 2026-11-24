import { API_LIMITS, type FitMode } from "@contract";
import { MusicIcon, PackageIcon, TimerIcon, XIcon } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { ConverterOptions } from "../types";

interface ConvertOptionsFormProps {
  options: ConverterOptions;
  disabled?: boolean;
  /** Current playhead of the preview video, if any. */
  currentTime?: number;
  /** Source duration, if known (bounds the start input). */
  sourceDuration?: number;
  /** Replacement sound file, if any (null = use the video's own audio). */
  audioFile: File | null;
  onChange: (patch: Partial<ConverterOptions>) => void;
  onAudioFileChange: (file: File | null) => void;
}

export function ConvertOptionsForm({
  options,
  disabled,
  currentTime,
  sourceDuration,
  audioFile,
  onChange,
  onAudioFileChange,
}: ConvertOptionsFormProps) {
  const audioInputRef = useRef<HTMLInputElement>(null);
  const maxStart = sourceDuration ? Math.max(0, sourceDuration - API_LIMITS.minDurationSec) : undefined;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="start">Inicio (s)</Label>
        <div className="flex gap-2">
          <Input
            id="start"
            type="number"
            min={0}
            max={maxStart}
            step={0.1}
            value={options.startSec}
            disabled={disabled}
            onChange={(e) => onChange({ startSec: Math.max(0, Number(e.target.value) || 0) })}
          />
          <Button
            type="button"
            variant="outline"
            disabled={disabled || currentTime === undefined}
            title="Usar el tiempo actual del video"
            onClick={() => currentTime !== undefined && onChange({ startSec: Number(currentTime.toFixed(1)) })}
          >
            <TimerIcon data-icon="inline-start" />
            Actual
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="duration">Duración (s)</Label>
        <Input
          id="duration"
          type="number"
          min={API_LIMITS.minDurationSec}
          max={API_LIMITS.maxDurationSec}
          step={0.5}
          value={options.durationSec}
          disabled={disabled}
          onChange={(e) => {
            const v = Number(e.target.value) || API_LIMITS.minDurationSec;
            onChange({
              durationSec: Math.min(API_LIMITS.maxDurationSec, Math.max(API_LIMITS.minDurationSec, v)),
            });
          }}
        />
      </div>

      <div className="space-y-2">
        <Label>Encuadre</Label>
        <Select value={options.fit} disabled={disabled} onValueChange={(v) => onChange({ fit: v as FitMode })}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pad">Padding transparente (todo el video)</SelectItem>
            <SelectItem value="crop">Recortar al centro (llenar)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border p-3 sm:self-end">
        <Label htmlFor="audio" className="flex flex-col items-start gap-0.5">
          <span>Incluir audio</span>
          <span className="text-xs font-normal text-muted-foreground">Opus · mismo segmento</span>
        </Label>
        <Switch
          id="audio"
          checked={options.includeAudio}
          disabled={disabled}
          onCheckedChange={(includeAudio) => onChange({ includeAudio })}
        />
      </div>

      {options.includeAudio && (
        <div className="space-y-3 rounded-lg border p-3 sm:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <p className="font-medium">Sonido</p>
              <p className="text-xs text-muted-foreground">
                {audioFile ? "Archivo propio (reemplaza el del video)" : "El del propio video"}
              </p>
            </div>
            {audioFile ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => onAudioFileChange(null)}
              >
                <XIcon data-icon="inline-start" />
                Usar el del video
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => audioInputRef.current?.click()}
              >
                <MusicIcon data-icon="inline-start" />
                Elegir audio…
              </Button>
            )}
            <input
              ref={audioInputRef}
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
            <div className="grid gap-2 sm:grid-cols-2 sm:items-end">
              <p className="flex min-w-0 items-center gap-2 text-sm">
                <MusicIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{audioFile.name}</span>
              </p>
              <div className="space-y-2">
                <Label htmlFor="audio-start">Inicio del audio (s)</Label>
                <Input
                  id="audio-start"
                  type="number"
                  min={0}
                  step={0.1}
                  value={options.audioStartSec}
                  disabled={disabled}
                  onChange={(e) => onChange({ audioStartSec: Math.max(0, Number(e.target.value) || 0) })}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-3 rounded-lg border p-3 sm:col-span-2">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="metadata" className="flex flex-col items-start gap-0.5">
            <span className="flex items-center gap-1.5">
              <PackageIcon className="size-4" /> Metadatos del pack
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              Lo que WhatsApp muestra al ver la info del sticker
            </span>
          </Label>
          <Switch
            id="metadata"
            checked={options.includeMetadata}
            disabled={disabled}
            onCheckedChange={(includeMetadata) => onChange({ includeMetadata })}
          />
        </div>
        {options.includeMetadata && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="pack">Pack</Label>
              <Input
                id="pack"
                maxLength={128}
                placeholder="Sticker Video Audio"
                value={options.packName ?? ""}
                disabled={disabled}
                onChange={(e) => onChange({ packName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="publisher">Autor</Label>
              <Input
                id="publisher"
                maxLength={128}
                placeholder="sva"
                value={options.publisher ?? ""}
                disabled={disabled}
                onChange={(e) => onChange({ publisher: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emojis">Emojis (máx. 3)</Label>
              <Input
                id="emojis"
                maxLength={64}
                placeholder="😂,🔊"
                value={options.emojis ?? ""}
                disabled={disabled}
                onChange={(e) => onChange({ emojis: e.target.value })}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
