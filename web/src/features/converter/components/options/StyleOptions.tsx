import { API_LIMITS, type FitMode } from "@contract";
import { useShallow } from "zustand/react/shallow";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { selectBusy, useConverterStore } from "../../store/converterStore";
import { GroupedList, SwitchListRow } from "../ui/GroupedList";

const FITS: { value: FitMode; title: string; detail: string }[] = [
  { value: "crop", title: "Llenar", detail: "Recorta al centro" },
  { value: "pad", title: "Completo", detail: "Bordes transparentes" },
];

/** Square canvas diagram: how a 16:9 frame lands in each mode. */
function FitGlyph({ fit }: { fit: FitMode }) {
  return (
    <span className="checkerboard grid aspect-square w-full place-items-center overflow-hidden rounded-xl">
      <span className={cn("bg-foreground/85", fit === "pad" ? "h-[56%] w-full" : "size-full")} />
    </span>
  );
}

export function StyleOptions() {
  const { fit, hq, kind, disabled, update } = useConverterStore(
    useShallow((s) => ({ fit: s.options.fit, hq: s.options.hq ?? false, kind: s.inputKind, disabled: selectBusy(s), update: s.updateOptions })),
  );
  return (
    <div className="space-y-4">
      <ToggleGroup
        type="single"
        value={fit}
        disabled={disabled}
        onValueChange={(v) => v && update({ fit: v as FitMode })}
        className="grid w-full grid-cols-2 gap-3"
        aria-label="Encuadre"
      >
        {FITS.map((f) => (
          <ToggleGroupItem
            key={f.value}
            value={f.value}
            className="h-auto flex-col items-stretch gap-2.5 rounded-2xl bg-muted/60 p-3 text-left ring-0 data-[state=on]:bg-muted data-[state=on]:shadow-[inset_0_0_0_2px_var(--foreground)]"
          >
            <FitGlyph fit={f.value} />
            <span>
              <span className="block text-[15px] font-medium">{f.title}</span>
              <span className="block text-[13px] font-normal whitespace-normal text-muted-foreground">{f.detail}</span>
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {kind !== "image" && (
        <GroupedList>
          <SwitchListRow
            id="hq"
            title="Calidad alta"
            detail={`Experimental · hasta ${API_LIMITS.maxExperimentalKb / 1024} MB en vez de 500 KB. WhatsApp podría no aceptarlo.`}
            checked={hq}
            disabled={disabled}
            onCheckedChange={(v) => update({ hq: v })}
          />
        </GroupedList>
      )}
    </div>
  );
}
