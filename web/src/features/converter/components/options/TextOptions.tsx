import { useEffect, useId, useRef, useState } from "react";
import { PaletteIcon } from "@/components/icons";
import { useShallow } from "zustand/react/shallow";
import { CheckIcon } from "@/components/icons";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { useClipStill } from "../../hooks/useClipStill";
import {
  drawMemeText,
  hasText,
  MAX_TEXT_CHARS,
  type MemeText,
  isHexColor,
  outlineFor,
  TEXT_COLORS,
  TEXT_FONTS,
  TEXT_STYLES,
  type TextFont,
  type TextSize,
  type TextStyle,
} from "../../model/memeText";
import { loadAllTextFonts, loadTextFont } from "../../model/textFonts";
import { selectBusy, useConverterStore } from "../../store/converterStore";
import { GroupedList, SwitchListRow } from "../ui/GroupedList";
import { useSegment } from "../segment/useSegment";
import { LiveSticker } from "./StickerLook";

const SIZES: { value: TextSize; label: string }[] = [
  { value: "s", label: "Chica" },
  { value: "m", label: "Media" },
  { value: "l", label: "Grande" },
];

/**
 * The same drawing that gets uploaded, live over the sticker preview (a
 * canvas at 512 scaled down by CSS): exact preview, no surprises.
 */
function TextLayer({ text, className }: { text: MemeText; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [fontsTick, setFontsTick] = useState(0);
  useEffect(() => {
    // Redraw once the caption font finishes loading (first paint may use a fallback).
    const f = TEXT_FONTS[text.font];
    loadTextFont(text.font)
      .then(() => document.fonts?.load(`${f.weight} 48px ${f.family}`, "AÁÑ"))
      .then(
      () => setFontsTick((n) => n + 1),
      () => {},
    );
  }, [text.font]);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) drawMemeText(ctx, text, 512);
  }, [text, fontsTick]);
  return <canvas ref={ref} width={512} height={512} aria-hidden className={cn("pointer-events-none absolute inset-0 size-full", className)} />;
}

function Caption({
  label,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-baseline justify-between text-[13px] font-medium">
        {label}
        <span className="font-normal text-muted-foreground tabular-nums">
          {value.length}/{MAX_TEXT_CHARS}
        </span>
      </label>
      <input
        id={id}
        value={value}
        maxLength={MAX_TEXT_CHARS}
        disabled={disabled}
        placeholder={placeholder}
        enterKeyHint="done"
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-xl bg-muted/60 px-3 text-[16px] outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      />
    </div>
  );
}

/** «Texto»: classic meme captions, top and bottom, with an exact live preview. */
export function TextOptions() {
  const { text, update, previewUrl, kind, fit, background, cropX, cropY, cropZoom, look, flip, disabled } = useConverterStore(
    useShallow((s) => ({
      text: s.text,
      update: s.updateText,
      previewUrl: s.previewUrl,
      kind: s.inputKind,
      fit: s.options.fit,
      background: s.options.background ?? "transparent",
      cropX: s.options.cropX,
      cropY: s.options.cropY,
      cropZoom: s.options.cropZoom,
      look: s.options.look,
      flip: s.options.flip === true,
      disabled: selectBusy(s),
    })),
  );
  const still = useClipStill();
  const seg = useSegment();

  return (
    <div className="space-y-5">
      <div className="grid items-start gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
        <figure className="mx-auto space-y-2 text-center sm:mx-0">
          <div className="relative size-48 sm:size-44 lg:size-48">
            <LiveSticker
              src={previewUrl}
              isVideo={kind === "video"}
              still={still}
              start={seg.start}
              end={seg.end}
              fit={fit}
              background={background}
              frame={{ x: cropX ?? 0.5, y: cropY ?? 0.5, zoom: cropZoom ?? 1 }}
              adjust={{ look, flip }}
              className="size-full"
            />
            <TextLayer text={text} className="rounded-[inherit]" />
          </div>
          <figcaption className="text-[12px] text-muted-foreground">
            {hasText(text) ? "Así quedará" : "Escribe y míralo aquí"}
          </figcaption>
        </figure>
        <div className="min-w-0 space-y-3">
          <Caption
            label="Texto arriba"
            value={text.top}
            placeholder="Cuando dicen «es la última»"
            disabled={disabled}
            onChange={(top) => update({ top })}
          />
          <Caption
            label="Texto abajo"
            value={text.bottom}
            placeholder="Y no era la última"
            disabled={disabled}
            onChange={(bottom) => update({ bottom })}
          />
        </div>
      </div>

      <div className={cn("space-y-4", !hasText(text) && "opacity-60")}>
        <FontPicker value={text.font} disabled={disabled} onChange={(font) => update({ font })} />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
          <Segmented
            label="Estilo del texto"
            value={text.style}
            disabled={disabled}
            options={(Object.keys(TEXT_STYLES) as TextStyle[]).map((v) => ({ value: v, label: TEXT_STYLES[v] }))}
            onChange={(style) => update({ style })}
          />
          <Segmented
            label="Tamaño del texto"
            value={text.size}
            disabled={disabled}
            options={SIZES}
            onChange={(size) => update({ size })}
          />
        </div>

        <ColorPicker value={text.color} disabled={disabled} onChange={(color) => update({ color })} />

        <GroupedList>
          <SwitchListRow
            id="text-caps"
            title="MAYÚSCULAS"
            detail="El estilo clásico de meme."
            checked={text.caps}
            disabled={disabled}
            onCheckedChange={(caps) => update({ caps })}
          />
        </GroupedList>
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  disabled: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      disabled={disabled}
      onValueChange={(v) => v && onChange(v as T)}
      className="max-w-full overflow-x-auto rounded-full bg-muted/60 p-1 [scrollbar-width:none]"
      aria-label={label}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          className="h-8 shrink-0 rounded-full px-3 text-[13px] data-[state=on]:bg-foreground data-[state=on]:text-background"
        >
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Typefaces as a swipeable row, each name written in its own font (like CapCut). */
function FontPicker({ value, disabled, onChange }: { value: TextFont; disabled: boolean; onChange: (f: TextFont) => void }) {
  useEffect(() => {
    void loadAllTextFonts();
  }, []);
  return (
    <div className="space-y-1.5">
      <p className="text-[13px] font-medium">Tipografía</p>
      <div
        role="radiogroup"
        aria-label="Tipografía"
        data-no-swipe
        className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {(Object.keys(TEXT_FONTS) as TextFont[]).map((f) => {
          const on = value === f;
          return (
            // biome-ignore lint/a11y/useSemanticElements: font chips styled as radio buttons
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => onChange(f)}
              className={cn(
                "flex h-14 w-[76px] shrink-0 snap-start flex-col items-center justify-center gap-0.5 rounded-2xl bg-muted/60 transition-colors disabled:opacity-50",
                on ? "bg-foreground text-background" : "hover:bg-muted",
              )}
            >
              <span
                className="text-[20px] leading-none"
                style={{ fontFamily: TEXT_FONTS[f].family, fontWeight: TEXT_FONTS[f].weight }}
                aria-hidden
              >
                Aa
              </span>
              <span className="text-[11px] opacity-80">{TEXT_FONTS[f].label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Quick colors + any color (native picker), the chosen custom one shown as a swatch. */
function ColorPicker({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (c: `#${string}`) => void }) {
  const custom = !TEXT_COLORS.some((c) => c.value === value);
  const inputId = useId();
  const swatch = (on: boolean) =>
    cn(
      "grid size-9 shrink-0 place-items-center rounded-full ring-1 ring-border transition-transform active:scale-95",
      on && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
    );
  // Check mark that reads on the swatch (same rule as the text outline).
  const check = (color: string) => (outlineFor(color) === "#000000" ? "#000" : "#fff");
  return (
    <div className="space-y-1.5">
      <p className="text-[13px] font-medium">Color</p>
      <div role="radiogroup" aria-label="Color del texto" className="flex flex-wrap gap-2">
        {TEXT_COLORS.map((c) => {
          const on = value === c.value;
          return (
            // biome-ignore lint/a11y/useSemanticElements: color swatches styled as radio buttons
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={c.label}
              title={c.label}
              disabled={disabled}
              onClick={() => onChange(c.value)}
              className={cn(swatch(on), "disabled:opacity-50")}
              style={{ background: c.value }}
            >
              {on && <CheckIcon className="size-4" style={{ color: check(c.value) }} />}
            </button>
          );
        })}
        <label
          htmlFor={inputId}
          title="Elegir cualquier color"
          className={cn(
            swatch(custom),
            "relative cursor-pointer overflow-hidden",
            !custom && "bg-[conic-gradient(from_0deg,#ff3366,#ffd23f,#2ecc71,#3d7dff,#a855f7,#ff3366)]",
            disabled && "pointer-events-none opacity-50",
          )}
          style={custom ? { background: value } : undefined}
        >
          {custom ? <CheckIcon className="size-4" style={{ color: check(value) }} /> : <PaletteIcon className="size-4 text-white drop-shadow" />}
          <span className="sr-only">Elegir cualquier color</span>
          <input
            id={inputId}
            type="color"
            value={isHexColor(value) ? value : "#ffffff"}
            disabled={disabled}
            onChange={(e) => isHexColor(e.target.value) && onChange(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}
