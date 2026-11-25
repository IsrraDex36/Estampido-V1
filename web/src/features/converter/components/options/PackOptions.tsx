import { useShallow } from "zustand/react/shallow";
import { Input } from "@/components/ui/input";
import { selectBusy, useConverterStore } from "../../store/converterStore";
import { GroupedList, Row, SwitchListRow } from "../ui/GroupedList";

type TextKey = "packName" | "publisher" | "emojis";
const FIELDS: { key: TextKey; label: string; placeholder: string; maxLength: number }[] = [
  { key: "packName", label: "Pack", placeholder: "Estampido", maxLength: 128 },
  { key: "publisher", label: "Autor", placeholder: "estampido", maxLength: 128 },
  { key: "emojis", label: "Emojis", placeholder: "😂, 🔊 (máx. 3)", maxLength: 64 },
];

export function PackOptions() {
  const { options, disabled, update } = useConverterStore(
    useShallow((s) => ({ options: s.options, disabled: selectBusy(s), update: s.updateOptions })),
  );
  return (
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
            <label htmlFor={f.key} className="w-20 shrink-0 text-[15px] font-medium">
              {f.label}
            </label>
            <Input
              id={f.key}
              placeholder={f.placeholder}
              maxLength={f.maxLength}
              disabled={disabled}
              value={options[f.key] ?? ""}
              onChange={(e) => update({ [f.key]: e.target.value })}
              className="h-9 border-0 bg-transparent px-0 text-right text-[15px] shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
          </Row>
        ))}
    </GroupedList>
  );
}
