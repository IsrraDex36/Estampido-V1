import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/** Title + description + switch, used across option tabs. */
export function SwitchRow({
  id,
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
  icon,
}: {
  id: string;
  title: string;
  description: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (v: boolean) => void;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border bg-card p-3.5 transition-colors has-[[data-state=checked]]:border-primary/40 has-[[data-state=checked]]:bg-accent/40">
      <Label htmlFor={id} className="flex flex-1 items-start gap-3">
        {icon && <span className="mt-0.5 text-muted-foreground [&_svg]:size-4">{icon}</span>}
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{title}</span>
          <span className="text-xs font-normal leading-snug text-muted-foreground">{description}</span>
        </span>
      </Label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}
