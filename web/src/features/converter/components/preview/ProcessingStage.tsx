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
        ) : status.kind === "queued" ? (
          <Queued position={status.position} etaSec={status.etaSec} />
        ) : (
          <Working expectedSec={status.kind === "processing" ? (status.expectedSec ?? 0) : 0} />
        )}
        <Button variant="ghost" size="sm" className="rounded-full" onClick={cancel}>
          Cancelar
        </Button>
      </div>
    </Stage>
  );
}

/** Waiting in the server's line: honest position and wait. */
function Queued({ position, etaSec }: { position: number; etaSec: number }) {
  return (
    <div className="w-full space-y-2">
      <p className="font-pixel text-[10px] text-muted-foreground">EN LA FILA</p>
      <p className="display text-5xl tabular-nums">
        {position === 1 ? "¡Sigues tú!" : `#${position}`}
      </p>
      <p className="text-[13px] leading-snug text-muted-foreground">
        {position === 1 ? "Empezamos en un momento." : `Hay ${position - 1} ${position === 2 ? "persona" : "personas"} antes que tú.`}
        {etaSec > 0 && (
          <>
            {" "}
            Espera aprox. <b className="text-foreground tabular-nums">{etaSec < 60 ? `${etaSec} s` : formatTime(etaSec)}</b>.
          </>
        )}
      </p>
      <p className="text-[12px] text-muted-foreground">Puedes dejar esta pestaña abierta: seguimos solos.</p>
    </div>
  );
}

/** Converting: elapsed time and, once known, an approximate progress bar. */
function Working({ expectedSec }: { expectedSec: number }) {
  const elapsed = useElapsed();
  // Approximate: eases toward 95 % around the typical time, never claims «done».
  const fraction = expectedSec > 0 ? Math.min(0.95, 1 - Math.exp(-elapsed / expectedSec)) : null;
  return (
    <div className="w-full space-y-2">
      <p className="text-lg font-semibold tracking-tight">Creando tu sticker</p>
      <p className="font-mono text-[13px] tabular-nums text-muted-foreground">
        {formatTime(Math.floor(elapsed))}
        {expectedSec > 0 && ` · suele tardar ~${Math.round(expectedSec)} s`}
      </p>
      {fraction !== null && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-foreground/10" aria-hidden>
          <div
            className="h-full origin-left rounded-full bg-sound transition-transform duration-700"
            style={{ transform: `scaleX(${fraction})` }}
          />
        </div>
      )}
      <p className="text-[13px] leading-snug text-muted-foreground">
        Ajustamos calidad y nitidez para que entre en el límite a 14–15 fps, y preparamos el sonido.
      </p>
    </div>
  );
}
