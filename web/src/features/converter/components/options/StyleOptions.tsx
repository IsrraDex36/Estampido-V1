import { API_LIMITS, type FitMode, type StickerBackground } from "@contract";
import type { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { CheckIcon, PlusIcon } from "@/components/icons";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { useClipStill } from "../../hooks/useClipStill";
import { selectBusy, useConverterStore } from "../../store/converterStore";
import { GroupedList, SwitchListRow } from "../ui/GroupedList";
import { StickerLook } from "./StickerLook";

const FITS: { value: FitMode; title: string; detail: string }[] = [
  { value: "crop", title: "Llenar", detail: "Recorta al centro" },
  { value: "pad", title: "Completo", detail: "Se ve todo, con fondo" },
];

const COLORS: { value: `#${string}`; label: string }[] = [
  { value: "#ffffff", label: "Blanco" },
  { value: "#000000", label: "Negro" },
  { value: "#ff3366", label: "Rosa" },
  { value: "#ffd23f", label: "Amarillo" },
  { value: "#2ecc71", label: "Verde" },
  { value: "#3d7dff", label: "Azul" },
  { value: "#8b5cf6", label: "Morado" },
];
const isPreset = (bg: StickerBackground) => bg === "transparent" || bg === "blur" || COLORS.some((c) => c.value === bg);

export function StyleOptions() {
  const { fit, background, hq, kind, disabled, update } = useConverterStore(
    useShallow((s) => ({
      fit: s.options.fit,
      background: s.options.background ?? "transparent",
      hq: s.options.hq ?? false,
      kind: s.inputKind,
      disabled: selectBusy(s),
      update: s.updateOptions,
    })),
  );
  const still = useClipStill();
  const setBackground = (bg: StickerBackground) => update({ background: bg, fit: "pad" });
  const custom = !isPreset(background);

  return (
    <div className="space-y-5">
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
            className="h-auto flex-col items-stretch gap-2.5 rounded-2xl bg-muted/60 p-3 text-left ring-0 data-[state=on]:bg-muted data-[state=on]:shadow-[inset_0_0_0_2px_var(--foreground)] sm:flex-row sm:items-center sm:gap-3"
          >
            <StickerLook still={still} fit={f.value} background={background} className="sm:size-20 sm:w-20 sm:shrink-0" />
            <span className="min-w-0">
              <span className="block text-[15px] font-medium">{f.title}</span>
              <span className="block text-[13px] font-normal whitespace-normal text-muted-foreground">{f.detail}</span>
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <fieldset className="space-y-3" disabled={disabled}>
        <legend className="flex w-full items-baseline justify-between gap-3">
          <span className="text-[15px] font-medium">Fondo</span>
          <span className="text-[13px] text-muted-foreground">
            {fit === "crop" ? "Elige uno y pasa a «Completo»" : "Rellena los bordes"}
          </span>
        </legend>
        <div className="grid grid-cols-5 justify-items-center gap-y-2.5 sm:flex sm:flex-wrap sm:gap-2.5" role="radiogroup" aria-label="Fondo">
          <Swatch label="Transparente" active={background === "transparent"} onPick={() => setBackground("transparent")}>
            <span className="checkerboard size-full" />
          </Swatch>
          <Swatch label="Desenfocado" active={background === "blur"} onPick={() => setBackground("blur")}>
            {still ? (
              <img src={still} alt="" className="size-full scale-125 object-cover blur-[3px]" />
            ) : (
              <span className="size-full bg-[conic-gradient(at_30%_30%,var(--sound),var(--retro-a),var(--sound))] blur-[2px]" />
            )}
          </Swatch>
          {COLORS.map((c) => (
            <Swatch key={c.value} label={c.label} active={background === c.value} onPick={() => setBackground(c.value)}>
              <span className="size-full" style={{ backgroundColor: c.value }} />
            </Swatch>
          ))}
          <label
            className={cn(
              "relative grid size-10 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full ring-offset-2 ring-offset-background focus-within:ring-2 focus-within:ring-ring",
              custom ? "ring-2 ring-foreground" : "ring-1 ring-border",
            )}
            title="Otro color"
            style={custom ? { backgroundColor: background } : undefined}
          >
            {!custom && (
              <span className="absolute inset-0 bg-[conic-gradient(red,yellow,lime,aqua,blue,magenta,red)] opacity-80" />
            )}
            <PlusIcon className={cn("relative size-4", custom ? "text-white mix-blend-difference" : "text-white")} weight="bold" />
            <span className="sr-only">Otro color</span>
            <input
              type="color"
              className="absolute inset-0 cursor-pointer opacity-0"
              value={custom ? background : "#ff8800"}
              onChange={(e) => setBackground(e.target.value as `#${string}`)}
            />
          </label>
        </div>
      </fieldset>

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

function Swatch({ label, active, onPick, children }: { label: string; active: boolean; onPick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      title={label}
      onClick={onPick}
      className={cn(
        "relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-full ring-offset-2 ring-offset-background transition-transform outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 disabled:opacity-50 motion-reduce:active:scale-100 [&>*:first-child]:absolute [&>*:first-child]:inset-0",
        active ? "ring-2 ring-foreground" : "ring-1 ring-border",
      )}
    >
      {children}
      {active && <CheckIcon className="relative size-4 text-white mix-blend-difference" weight="bold" />}
    </button>
  );
}
