import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** iOS-Settings-style grouped list: rows separated by hairlines. */
export function GroupedList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("divide-y divide-border overflow-hidden rounded-2xl bg-muted/60", className)}>{children}</div>;
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex min-h-14 items-center gap-4 px-4 py-3", className)}>{children}</div>;
}

export function RowText({ title, detail }: { title: ReactNode; detail?: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-[15px] font-medium leading-tight">{title}</span>
      {detail && <span className="text-[13px] leading-snug text-muted-foreground">{detail}</span>}
    </span>
  );
}

export function SwitchListRow({
  id,
  title,
  detail,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  title: ReactNode;
  detail?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <Row>
      <Label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer">
        <RowText title={title} detail={detail} />
      </Label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </Row>
  );
}
