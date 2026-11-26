import { STICKER_DEFAULTS } from "@contract";
import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Volume2Icon } from "@/components/icons";
import { drawMemeText, hasLayers, type MemeText } from "../../model/memeText";
import { Input } from "@/components/ui/input";
import { useClipStill } from "../../hooks/useClipStill";
import { selectBusy, useConverterStore } from "../../store/converterStore";
import { GroupedList, Row, SwitchListRow } from "../ui/GroupedList";
import { StickerLook } from "./StickerLook";

type TextKey = "packName" | "publisher";
const FIELDS: { key: TextKey; label: string; placeholder: string }[] = [
  { key: "packName", label: "Pack", placeholder: STICKER_DEFAULTS.packName },
  { key: "publisher", label: "Autor", placeholder: STICKER_DEFAULTS.publisher },
];

/** Pack name + author, with a live «sticker info» card like WhatsApp's. */
export function PackOptions() {
  const { options, text, disabled, update } = useConverterStore(
    useShallow((s) => ({ options: s.options, text: s.text, disabled: selectBusy(s), update: s.updateOptions })),
  );
  const still = useClipStill();
  const pack = options.packName?.trim() || STICKER_DEFAULTS.packName;
  const author = options.publisher?.trim() || STICKER_DEFAULTS.publisher;

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
      {options.includeMetadata && !options.packName?.trim() && !options.publisher?.trim() && (
        <p className="-mt-2 px-1 text-[12px] text-muted-foreground">
          Vacío, invita a quien lo reciba a crear los suyos en {STICKER_DEFAULTS.publisher}.
        </p>
      )}

      {/* Grows into the free space (lg: the column matches the clip's height). */}
      <figure className="flex flex-1 flex-col gap-2">
        <figcaption className="px-1 text-[13px] text-muted-foreground">Así lo verán en WhatsApp</figcaption>
        <WhatsAppMock
          sticker={
            <StickerPreview
              still={still}
              fit={options.fit}
              background={options.background ?? "transparent"}
              frame={{ x: options.cropX ?? 0.5, y: options.cropY ?? 0.5, zoom: options.cropZoom ?? 1 }}
              adjust={{ look: options.look, flip: options.flip === true }}
              text={text}
            />
          }
          withSound={options.includeAudio}
          pack={options.includeMetadata ? pack : null}
          author={options.includeMetadata ? author : null}
        />
      </figure>
    </div>
  );
}

/** The sticker as it will look: framing, look/mirror and the text/emoji layer. */
function StickerPreview({
  text,
  ...look
}: React.ComponentProps<typeof StickerLook> & { text: MemeText }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) drawMemeText(ctx, text, 512);
  }, [text]);
  return (
    <div className="relative size-full">
      <StickerLook {...look} checker={false} className="size-full rounded-none" />
      {hasLayers(text) && <canvas ref={ref} width={512} height={512} aria-hidden className="absolute inset-0 size-full" />}
    </div>
  );
}

const WA = {
  chat: "#0b141a",
  bar: "#202c33",
  sheet: "#1f2c34",
  text: "#e9edef",
  muted: "#8696a0",
  green: "#00a884",
  tick: "#53bdeb",
} as const;

/**
 * A WhatsApp-like phone screen (always WhatsApp's dark palette): your sent
 * sticker in the chat with time and ✓✓, and the «sticker info» sheet that
 * opens when someone taps it (pack name • author).
 */
function WhatsAppMock({
  sticker,
  withSound,
  pack,
  author,
}: {
  sticker: React.ReactNode;
  withSound: boolean;
  pack: string | null;
  author: string | null;
}) {
  const [time] = useState(() => new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit" }).format(new Date()));
  return (
    <div
      className="flex flex-1 flex-col overflow-hidden rounded-3xl ring-1 ring-black/40"
      style={{ background: WA.chat, color: WA.text }}
      aria-label="Vista previa en WhatsApp"
    >
      {/* Chat header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5" style={{ background: WA.bar }}>
        <span className="grid size-8 place-items-center rounded-full bg-[#6a7175] text-[13px] font-semibold">🙂</span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[14px] font-medium">Tu amigo</span>
          <span className="block text-[11px]" style={{ color: WA.muted }}>
            en línea
          </span>
        </span>
      </div>

      {/* Chat body with the doodle wallpaper */}
      <div
        className="relative flex flex-1 flex-col items-end justify-end gap-1 px-3 py-3"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, rgb(255 255 255 / 0.035) 0 2px, transparent 3px), radial-gradient(circle at 70% 60%, rgb(255 255 255 / 0.03) 0 2px, transparent 3px)",
          backgroundSize: "34px 34px, 46px 46px",
        }}
      >
        <span
          className="mx-auto mb-1 rounded-lg px-2.5 py-1 text-[11px]"
          style={{ background: "#182229", color: WA.muted }}
        >
          HOY
        </span>
        <div className="relative size-32 sm:size-36">
          {sticker}
          {withSound && (
            <span className="absolute bottom-1 left-1 grid size-6 place-items-center rounded-full bg-black/55 text-white">
              <Volume2Icon className="size-3.5" />
            </span>
          )}
        </div>
        <span className="flex items-center gap-1 rounded-md bg-black/35 px-1.5 py-0.5 text-[11px]" style={{ color: WA.muted }}>
          {time}
          <span style={{ color: WA.tick }} aria-label="leído">
            ✓✓
          </span>
        </span>
      </div>

      {/* Sticker info sheet (what tapping the sticker shows) */}
      <div className="rounded-t-2xl px-4 pt-2 pb-4" style={{ background: WA.sheet }}>
        <span className="mx-auto mb-3 block h-1 w-9 rounded-full bg-white/20" aria-hidden />
        {pack ? (
          <div className="flex items-center gap-3">
            <div className="size-12 shrink-0">{sticker}</div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[15px] leading-tight font-semibold break-words" title={pack}>
                {pack}
              </p>
              <p className="truncate text-[12px]" style={{ color: WA.muted }} title={author ?? ""}>
                {author} • 1 sticker
              </p>
            </div>
            <span className="shrink-0 text-[13px] font-semibold" style={{ color: WA.green }}>
              ☆ Favoritos
            </span>
          </div>
        ) : (
          <p className="text-[13px]" style={{ color: WA.muted }}>
            Sin datos del pack: al tocarlo no se ve nombre ni autor.
          </p>
        )}
      </div>
    </div>
  );
}
