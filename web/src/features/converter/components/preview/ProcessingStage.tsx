import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/time";
import { useElapsed } from "../../hooks/useElapsed";
import { useConverterStore } from "../../store/converterStore";
import { Mascot } from "@/components/pixel/Mascot";
import { Stage } from "./Stage";

/** Interactive loader: real upload %, real elapsed time, cancel. */
export function ProcessingStage() {
  const { status, cancel } = useConverterStore(useShallow((s) => ({ status: s.status, cancel: s.cancel })));
  const uploading = status.kind === "uploading";
  const percent = uploading ? Math.round(status.progress * 100) : 100;

  return (
    <Stage>
      <div className="flex w-full max-w-72 flex-col items-center gap-6 px-6 text-center" aria-live="polite">
        <Mascot mood="singing" size={104} />
        {uploading ? (
          <div className="w-full space-y-3">
            <p className="display text-5xl tabular-nums">{percent}%</p>
            <p className="text-[13px] text-muted-foreground">Subiendo tu clip</p>
            <div className="h-1 w-full overflow-hidden rounded-full bg-foreground/10">
              <div
                className="h-full origin-left rounded-full bg-foreground transition-transform duration-300"
                style={{ transform: `scaleX(${percent / 100})` }}
              />
            </div>
          </div>
        ) : (
          <Working />
        )}
        <Button variant="ghost" size="sm" className="rounded-full" onClick={cancel}>
          Cancelar
        </Button>
      </div>
    </Stage>
  );
}

function Working() {
  const elapsed = useElapsed();
  return (
    <div className="space-y-2">
      <p className="text-lg font-semibold tracking-tight">Creando tu sticker</p>
      <p className="font-mono text-[13px] tabular-nums text-muted-foreground">{formatTime(Math.floor(elapsed))}</p>
      <p className="text-[13px] leading-snug text-muted-foreground">
        Ajustamos calidad y nitidez para que entre en el límite a 14–15 fps, y preparamos el sonido.
      </p>
    </div>
  );
}
