import { ConvertButton } from "../components/ConvertButton";
import { SettingsTabs } from "../components/SettingsTabs";
import { SETTINGS_TABS } from "../components/settingsTabList";
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
      <div className="grid grid-cols-4 gap-1 rounded-2xl bg-muted p-1 opacity-60">
        {SETTINGS_TABS.map((t) => (
          <span
            key={t.value}
            className="flex flex-col items-center gap-0.5 py-2 text-[13px] text-muted-foreground [&_svg]:size-4"
          >
            <span className="flex items-center gap-1.5">
              {t.icon}
              {t.label}
            </span>
            <span className="text-[11px]">—</span>
          </span>
        ))}
      </div>
      <p className="py-6 text-center text-[13px] text-muted-foreground">Elige un clip para ver tiempo, sonido y estilo.</p>
    </div>
  );
}
