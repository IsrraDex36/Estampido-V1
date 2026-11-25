import { InfoIcon } from "lucide-react";

/** Pipeline warnings, quiet and readable. */
export function ResultNotes({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="space-y-2">
      {warnings.map((w) => (
        <li key={w} className="flex gap-2.5 text-[13px] leading-snug text-muted-foreground">
          <InfoIcon className="mt-0.5 size-4 shrink-0" />
          {w}
        </li>
      ))}
    </ul>
  );
}
