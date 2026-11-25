import { Loader2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ConverterStatus } from "../types";

interface ConversionProgressProps {
  status: Extract<ConverterStatus, { kind: "uploading" | "processing" }>;
  onCancel: () => void;
}

export function ConversionProgress({ status, onCancel }: ConversionProgressProps) {
  const uploading = status.kind === "uploading";
  const percent = uploading ? Math.round(status.progress * 100) : 100;

  return (
    <div className="space-y-2 rounded-xl border bg-card p-3" aria-live="polite">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <Loader2Icon className="size-4 animate-spin text-primary" />
          {uploading ? `Subiendo… ${percent}%` : "Convirtiendo y ajustando el tamaño…"}
        </span>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <XIcon data-icon="inline-start" />
          Cancelar
        </Button>
      </div>
      <Progress value={percent} className={uploading ? "h-1.5" : "h-1.5 animate-pulse"} />
      {!uploading && (
        <p className="text-xs text-muted-foreground">Buscando los fps más altos que entran en el límite.</p>
      )}
    </div>
  );
}
