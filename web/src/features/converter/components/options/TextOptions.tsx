import { useEffect, useId, useRef, useState } from "react";
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
  TEXT_COLORS,
  TEXT_FONTS,
  type TextFont,
  type TextSize,
} from "../../model/memeText";
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
    // Redraw once the caption fonts finish loading (first paint may use a fallback).
    const f = TEXT_FONTS[text.font];
    document.fonts?.load(`${f.weight} 48px ${f.family}`, "AÁÑ").then(
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
  const { text, update, previewUrl, kind, fit, background, cropX, cropY, cropZoom, disabled } = useConverterStore(
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <ToggleGroup
            type="single"
            value={text.size}
            disabled={disabled}
            onValueChange={(v) => v && update({ size: v as TextSize })}
            className="rounded-full bg-muted/60 p-1"
            aria-label="Tamaño del texto"
          >
            {SIZES.map((s) => (
              <ToggleGroupItem
                key={s.value}
                value={s.value}
                className="h-8 rounded-full px-3 text-[13px] data-[state=on]:bg-foreground data-[state=on]:text-background"
              >
                {s.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ToggleGroup
            type="single"
            value={text.font}
            disabled={disabled}
            onValueChange={(v) => v && update({ font: v as TextFont })}
            className="rounded-full bg-muted/60 p-1"
            aria-label="Letra"
          >
            {(Object.keys(TEXT_FONTS) as TextFont[]).map((f) => (
              <ToggleGroupItem
                key={f}
                value={f}
                style={{ fontFamily: TEXT_FONTS[f].family, fontWeight: TEXT_FONTS[f].weight }}
                className="h-8 rounded-full px-3 text-[13px] data-[state=on]:bg-foreground data-[state=on]:text-background"
              >
                {TEXT_FONTS[f].label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div role="radiogroup" aria-label="Color del texto" className="flex flex-wrap gap-2">
          {TEXT_COLORS.map((c) => {
            const on = text.color === c.value;
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
                onClick={() => update({ color: c.value })}
                className={cn(
                  "grid size-9 place-items-center rounded-full ring-1 ring-border transition-transform active:scale-95 disabled:opacity-50",
                  on && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                )}
                style={{ background: c.value }}
              >
                {on && <CheckIcon className="size-4" style={{ color: c.value === "#ffffff" || c.value === "#ffd23f" ? "#000" : "#fff" }} />}
              </button>
            );
          })}
        </div>

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
