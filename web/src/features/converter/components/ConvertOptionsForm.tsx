import { API_LIMITS, type FitMode } from "@contract";
import { TimerIcon } from "lucide-react";
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
  onChange: (patch: Partial<ConverterOptions>) => void;
}

export function ConvertOptionsForm({
  options,
  disabled,
  currentTime,
  sourceDuration,
  onChange,
}: ConvertOptionsFormProps) {
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
    </div>
  );
}
