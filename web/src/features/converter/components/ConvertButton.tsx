import { CircleAlertIcon } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { selectBusy, useConverterStore } from "../store/converterStore";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Primary call to action + conversion error. */
export function ConvertButton() {
  const { hasFile, busy, error, convert } = useConverterStore(
    useShallow((s) => ({
      hasFile: Boolean(s.file),
      busy: selectBusy(s),
      error: s.status.kind === "error" ? s.status.message : null,
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
      {error && (
        <p role="alert" className="flex items-start gap-2 text-[13px] leading-snug text-destructive">
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
