import { useShallow } from "zustand/react/shallow";
import { Input } from "@/components/ui/input";
import { useClipStill } from "../../hooks/useClipStill";
import { selectBusy, useConverterStore } from "../../store/converterStore";
import { GroupedList, Row, SwitchListRow } from "../ui/GroupedList";
import { StickerLook } from "./StickerLook";

type TextKey = "packName" | "publisher";
const FIELDS: { key: TextKey; label: string; placeholder: string }[] = [
  { key: "packName", label: "Pack", placeholder: "Estampido" },
  { key: "publisher", label: "Autor", placeholder: "estampido" },
];

/** Pack name + author, with a live «sticker info» card like WhatsApp's. */
export function PackOptions() {
  const { options, disabled, update } = useConverterStore(
    useShallow((s) => ({ options: s.options, disabled: selectBusy(s), update: s.updateOptions })),
  );
  const still = useClipStill();
  const pack = options.packName?.trim() || "Estampido";
  const author = options.publisher?.trim() || "estampido";

  return (
    <div className="flex flex-1 flex-col gap-4">
      <GroupedList>
        <SwitchListRow
          id="metadata"
          title="Datos del pack"
          detail="Lo que se ve al abrir la información del sticker."
          checked={options.includeMetadata}
          disabled={disabled}
          onCheckedChange={(v) => update({ includeMetadata: v })}
        />
        {options.includeMetadata &&
          FIELDS.map((f) => (
            <Row key={f.key} className="py-2">
              <label htmlFor={f.key} className="w-16 shrink-0 text-[15px] font-medium">
                {f.label}
              </label>
              <Input
                id={f.key}
                placeholder={f.placeholder}
                maxLength={128}
                disabled={disabled}
                value={options[f.key] ?? ""}
                onChange={(e) => update({ [f.key]: e.target.value })}
                className="h-9 border-0 bg-transparent px-0 text-right text-[15px] shadow-none focus-visible:ring-0 dark:bg-transparent"
              />
            </Row>
          ))}
      </GroupedList>

      {/* Grows into the free space (lg: the column matches the clip's height). */}
      <figure className="flex flex-1 flex-col gap-2">
        <figcaption className="px-1 text-[13px] text-muted-foreground">Así lo verán en WhatsApp</figcaption>
        <div className="flex flex-1 items-center gap-4 rounded-2xl bg-muted/60 p-4 lg:gap-5 lg:p-5">
          <StickerLook
            still={still}
            fit={options.fit}
            background={options.background ?? "transparent"}
            frame={{ x: options.cropX ?? 0.5, y: options.cropY ?? 0.5, zoom: options.cropZoom ?? 1 }}
            className="size-20 w-20 shrink-0 rounded-lg lg:size-28 lg:w-28"
          />
          <div className="min-w-0 flex-1 space-y-1">
            {options.includeMetadata ? (
              <>
                <p className="truncate text-[16px] leading-tight font-semibold">{pack}</p>
                <p className="truncate text-[13px] text-muted-foreground">
                  {author} · 1 sticker
                </p>
                <p className="pt-1 text-[12px] text-sound">{options.includeAudio ? "🔊 Suena al tocarlo" : "Sin sonido"}</p>
              </>
            ) : (
              <p className="text-[13px] text-muted-foreground">Sin datos: WhatsApp no mostrará nombre ni autor.</p>
            )}
          </div>
        </div>
      </figure>
    </div>
  );
}
