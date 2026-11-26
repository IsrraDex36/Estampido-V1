import { VOICE_EFFECTS, type VoiceEffect } from "@contract";
import { Loader2Icon, PlayIcon, SquareIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useVoicePreview } from "../../hooks/useVoicePreview";
import { VOICE_EMOJI as EMOJI, VOICE_LABELS } from "../../model/voice";

/** «Efecto de voz»: one tap, applied on the server (same length, stays in sync). */
export function VoiceEffects({
  value,
  disabled,
  onChange,
}: {
  value: VoiceEffect | undefined;
  disabled: boolean;
  onChange: (v: VoiceEffect | undefined) => void;
}) {
  const preview = useVoicePreview();
  const playing = preview.state === "playing" || preview.state === "loading";
  const pick = (id: VoiceEffect | undefined) => {
    onChange(id);
    // Listening already → switch to the new effect right away (A/B by tapping).
    if (playing) void preview.play(id);
  };
  const options: { id: VoiceEffect | undefined; label: string; emoji: string }[] = [
    { id: undefined, label: "Normal", emoji: "🎙️" },
    ...VOICE_EFFECTS.map((id) => ({ id, label: VOICE_LABELS[id], emoji: EMOJI[id] })),
  ];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium">
          Efecto de voz <span className="font-normal text-muted-foreground">· se aplica al crear</span>
        </p>
        {preview.available && (
          <button
            type="button"
            onClick={() => (playing ? preview.stop() : void preview.play(value))}
            aria-pressed={playing}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition-colors",
              playing ? "bg-sound text-black" : "bg-muted text-foreground hover:bg-muted/70",
            )}
          >
            {preview.state === "loading" ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : playing ? (
              <SquareIcon className="size-3.5" weight="fill" />
            ) : (
              <PlayIcon className="size-3.5" weight="fill" />
            )}
            {playing ? "Detener" : "Escuchar"}
          </button>
        )}
      </div>
      <div role="radiogroup" aria-label="Efecto de voz" className="grid grid-cols-5 gap-1.5">
        {options.map((o) => {
          const on = value === o.id;
          return (
            // biome-ignore lint/a11y/useSemanticElements: chips styled as radio buttons
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => pick(o.id)}
              className={cn(
                "flex min-w-0 flex-col items-center gap-0.5 rounded-2xl bg-muted/60 px-0.5 py-2 text-[11px] tracking-tight sm:text-[12px] transition-colors disabled:opacity-50",
                on ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="text-[18px] leading-none" aria-hidden>
                {o.emoji}
              </span>
              <span className="max-w-full truncate font-medium">{o.label}</span>
            </button>
          );
        })}
      </div>
      {preview.state === "error" ? (
        <p className="text-[12px] text-muted-foreground">Este navegador no pudo leer el sonido para escucharlo aquí; el efecto sí se aplica al crear.</p>
      ) : (
        preview.available && <p className="text-[11px] text-muted-foreground">Escuchar es una vista previa aproximada (hasta 6 s).</p>
      )}
    </div>
  );
}
