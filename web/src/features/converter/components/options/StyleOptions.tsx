import { API_LIMITS, type FitMode } from "@contract";
import { SparklesIcon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { ConverterOptions, InputKind } from "../../types";
import { SwitchRow } from "./OptionRow";

/** Mini diagram of each framing mode (a 16:9 frame inside the square). */
function FitGlyph({ fit }: { fit: FitMode }) {
  return (
    <span className="checkerboard relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-md border">
      <span
        className={cn(
          "bg-gradient-to-br from-primary/80 to-primary/40",
          fit === "pad" ? "h-[56%] w-full" : "h-full w-[178%]",
        )}
      />
    </span>
  );
}

const FITS: { value: FitMode; title: string; description: string }[] = [
  { value: "crop", title: "Llenar", description: "Recorta al centro; sin bordes" },
  { value: "pad", title: "Completo", description: "Todo el cuadro, bordes transparentes" },
];

export function StyleOptions({
  options,
  inputKind,
  disabled,
  onChange,
}: {
  options: ConverterOptions;
  inputKind: InputKind;
  disabled?: boolean;
  onChange: (patch: Partial<ConverterOptions>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="text-sm font-medium">Encuadre</p>
        <ToggleGroup
          type="single"
          value={options.fit}
          disabled={disabled}
          onValueChange={(v) => v && onChange({ fit: v as FitMode })}
          className="grid w-full grid-cols-2 gap-2"
        >
          {FITS.map((f) => (
            <ToggleGroupItem
              key={f.value}
              value={f.value}
              aria-label={f.title}
              className="h-auto justify-start gap-3 rounded-xl border bg-card p-3 text-left data-[state=on]:border-primary data-[state=on]:bg-accent/50 data-[state=on]:ring-2 data-[state=on]:ring-primary/20"
            >
              <FitGlyph fit={f.value} />
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">{f.title}</span>
                <span className="text-xs font-normal leading-snug whitespace-normal text-muted-foreground">
                  {f.description}
                </span>
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {inputKind !== "image" && (
        <SwitchRow
          id="hq"
          icon={<SparklesIcon />}
          title="Calidad alta · experimental"
          description={`Hasta ${API_LIMITS.maxExperimentalKb / 1024} MB en vez de 500 KB: más fluido en clips largos. WhatsApp podría no aceptarlo.`}
          checked={options.hq ?? false}
          disabled={disabled}
          onCheckedChange={(hq) => onChange({ hq })}
        />
      )}
    </div>
  );
}
