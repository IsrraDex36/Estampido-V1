import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { formatTime, parseTime } from "@/lib/time";
import { cn } from "@/lib/utils";

interface TimeInputProps extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> {
  /** Seconds; undefined = empty (e.g. "auto"). */
  value: number | undefined;
  onValueChange: (sec: number | undefined) => void;
  min?: number;
  max?: number;
  /** Allow clearing the field (→ undefined). */
  allowEmpty?: boolean;
}

/**
 * Text field that accepts "1:30", "90" or "1:30.5". Commits on blur/Enter,
 * clamps to [min, max], shows an error state while the draft is invalid.
 */
export function TimeInput({ value, onValueChange, min = 0, max, allowEmpty, className, ...props }: TimeInputProps) {
  const [draft, setDraft] = useState(value === undefined ? "" : formatTime(value));
  const [invalid, setInvalid] = useState(false);

  // Follow external changes (slider, presets) — re-sync the draft text.
  const external = value === undefined ? "" : formatTime(value);
  const [lastExternal, setLastExternal] = useState(external);
  if (external !== lastExternal) {
    setLastExternal(external);
    setDraft(external);
    setInvalid(false);
  }

  useEffect(() => {
    if (!invalid) return;
    const t = setTimeout(() => setInvalid(false), 4000);
    return () => clearTimeout(t);
  }, [invalid]);

  const commit = () => {
    if (draft.trim() === "" && allowEmpty) {
      setInvalid(false);
      onValueChange(undefined);
      return;
    }
    const parsed = parseTime(draft);
    if (parsed === null) {
      setInvalid(true);
      return;
    }
    const clamped = Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, parsed));
    setInvalid(false);
    setDraft(formatTime(clamped));
    onValueChange(clamped);
  };

  return (
    <Input
      inputMode="decimal"
      autoComplete="off"
      aria-invalid={invalid || undefined}
      title="Formato m:ss (p. ej. 1:30) o segundos"
      className={cn("tabular-nums", invalid && "border-destructive", className)}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      {...props}
    />
  );
}
