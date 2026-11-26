import { useQuery } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { TimerIcon } from "@/components/icons";
import { getQueueInfo } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { selectBusy, useConverterStore } from "../store/converterStore";
import { ConvertErrorCard } from "./ConvertErrorCard";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Primary call to action + conversion error. */
export function ConvertButton() {
  const { hasFile, busy, error, attempt, convert } = useConverterStore(
    useShallow((s) => ({
      hasFile: Boolean(s.file),
      busy: selectBusy(s),
      error: s.status.kind === "error" ? s.status.error : null,
      attempt: s.attempt,
      convert: s.convert,
    })),
  );
  return (
    <div className="space-y-3">
      <Button
        className="h-13 w-full rounded-full text-base font-semibold tracking-tight"
        disabled={!hasFile || busy}
        onClick={() => void convert()}
      >
        {busy ? "Creando…" : "Crear sticker"}
        {!busy && (
          <kbd className="ml-2 hidden rounded-md bg-primary-foreground/15 px-1.5 py-0.5 font-mono text-[11px] font-medium sm:inline">
            {isMac ? "⌘" : "Ctrl"} ↵
          </kbd>
        )}
      </Button>
      {error ? <ConvertErrorCard key={attempt} failure={error} /> : <QueueHint enabled={hasFile && !busy} />}
    </div>
  );
}

/** «There's a line right now» before pressing Create (checked every 15 s while a file is ready). */
function QueueHint({ enabled }: { enabled: boolean }) {
  const q = useQuery({
    queryKey: ["converter", "queue"],
    queryFn: ({ signal }) => getQueueInfo(signal),
    enabled,
    refetchInterval: 15_000,
    staleTime: 10_000,
    meta: { errorMessage: false },
  });
  const info = q.data;
  if (!enabled || !info || info.etaSec < 10) return null;
  return (
    <p className="flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground" role="status">
      <TimerIcon className="size-3.5 text-retro-a" />
      {info.full ? "Mucha demanda ahora: si la fila está llena, reintentamos por ti." : `Hay fila: espera aprox. ${info.etaSec} s.`}
    </p>
  );
}
