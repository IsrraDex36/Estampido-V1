import { ConvertButton } from "../components/ConvertButton";
import { SettingsTabs } from "../components/SettingsTabs";
import { useConverterStore } from "../store/converterStore";
import { Section } from "@/components/section";

export function SettingsSection({ className }: { className?: string }) {
  const hasFile = useConverterStore((s) => Boolean(s.file));
  return (
    <Section index="02" title="Ajustes" className={className}>
      <div className="space-y-6">
        {hasFile ? <SettingsTabs /> : <SettingsPlaceholder />}
        <ConvertButton />
      </div>
    </Section>
  );
}

/** Before a clip exists: the shape of what's coming, clearly inactive. */
function SettingsPlaceholder() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="grid h-10 grid-cols-4 gap-1 rounded-full bg-muted p-1 opacity-60">
        {["Tiempo", "Sonido", "Estilo", "Pack"].map((t) => (
          <span key={t} className="grid place-items-center text-[13px] text-muted-foreground">
            {t}
          </span>
        ))}
      </div>
      <p className="py-6 text-center text-[13px] text-muted-foreground">Elige un clip para ver tiempo, sonido y estilo.</p>
    </div>
  );
}
