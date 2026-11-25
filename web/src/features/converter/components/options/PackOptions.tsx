import { PackageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ConverterOptions } from "../../types";
import { SwitchRow } from "./OptionRow";

type TextKey = "packName" | "publisher" | "emojis";

const FIELDS: { key: TextKey; label: string; placeholder: string; maxLength: number }[] = [
  { key: "packName", label: "Nombre del pack", placeholder: "Sticker Video Audio", maxLength: 128 },
  { key: "publisher", label: "Autor", placeholder: "sva", maxLength: 128 },
  { key: "emojis", label: "Emojis (máx. 3)", placeholder: "😂,🔊", maxLength: 64 },
];

export function PackOptions({
  options,
  disabled,
  onChange,
}: {
  options: ConverterOptions;
  disabled?: boolean;
  onChange: (patch: Partial<ConverterOptions>) => void;
}) {
  return (
    <div className="space-y-3">
      <SwitchRow
        id="metadata"
        icon={<PackageIcon />}
        title="Datos del pack"
        description="Lo que WhatsApp muestra al ver la información del sticker."
        checked={options.includeMetadata}
        disabled={disabled}
        onCheckedChange={(includeMetadata) => onChange({ includeMetadata })}
      />
      {options.includeMetadata && (
        <div className="grid gap-3 sm:grid-cols-3">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={f.key} className="text-xs text-muted-foreground">
                {f.label}
              </Label>
              <Input
                id={f.key}
                placeholder={f.placeholder}
                maxLength={f.maxLength}
                disabled={disabled}
                value={options[f.key] ?? ""}
                onChange={(e) => onChange({ [f.key]: e.target.value })}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
