import { Loader2Icon } from "lucide-react";
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
    <div className="space-y-2" aria-live="polite">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2">
          <Loader2Icon className="size-4 animate-spin" />
          {uploading ? `Subiendo… ${percent}%` : "Convirtiendo y optimizando (≤ 500 KB)…"}
        </span>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
      <Progress value={percent} className={uploading ? undefined : "animate-pulse"} />
    </div>
  );
}
