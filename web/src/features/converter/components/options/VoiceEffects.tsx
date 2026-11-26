import { VOICE_EFFECTS, type VoiceEffect } from "@contract";
import { cn } from "@/lib/utils";
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
  const options: { id: VoiceEffect | undefined; label: string; emoji: string }[] = [
    { id: undefined, label: "Normal", emoji: "🎙️" },
    ...VOICE_EFFECTS.map((id) => ({ id, label: VOICE_LABELS[id], emoji: EMOJI[id] })),
  ];
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium">
        Efecto de voz <span className="font-normal text-muted-foreground">· se aplica al crear</span>
      </p>
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
              onClick={() => onChange(o.id)}
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
    </div>
  );
}
