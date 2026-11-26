import { REPORT_NOTE_MAX, REPORT_REASONS, type ReportReason } from "@contract";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { FlagIcon, Loader2Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { reportSticker } from "../api/endpoints";

/** «Reportar»: pick a reason (+ optional note). Enough reports hide it until reviewed. */
export function ReportDialog({
  stickerId,
  title,
  open,
  onOpenChange,
}: {
  stickerId: string;
  title: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const noteId = useId();
  const send = useMutation({
    mutationKey: ["community", "report", stickerId],
    mutationFn: () => reportSticker(stickerId, { reason: reason as ReportReason, note: note.trim() || undefined }),
    meta: { errorMessage: false },
    onSuccess: ({ reported }) => {
      notify.success(reported ? "Gracias. Lo revisaremos pronto." : "Ya lo habías reportado. Lo estamos revisando.");
      close();
    },
    onError: (err) => notify.error(err instanceof ApiError ? err : null, { fallback: "No se pudo enviar el reporte." }),
  });
  const close = () => {
    onOpenChange(false);
    setReason(null);
    setNote("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlagIcon className="size-5" /> Reportar «{title}»
          </DialogTitle>
          <DialogDescription>
            Cuéntanos qué pasa. Si varias personas lo reportan, se oculta mientras lo revisamos.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason) send.mutate();
          }}
        >
          <div role="radiogroup" aria-label="Motivo" className="grid gap-1.5">
            {REPORT_REASONS.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={reason === r.id}
                onClick={() => setReason(r.id)}
                className={cn(
                  "rounded-xl px-3 py-2.5 text-left text-[14px] ring-1 transition-colors",
                  reason === r.id ? "bg-foreground text-background ring-foreground" : "ring-border hover:bg-muted/60",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <label htmlFor={noteId} className="flex justify-between text-[13px] text-muted-foreground">
              Detalles (opcional)
              <span className="tabular-nums">
                {note.length}/{REPORT_NOTE_MAX}
              </span>
            </label>
            <textarea
              id={noteId}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={REPORT_NOTE_MAX}
              rows={2}
              className="w-full resize-none rounded-xl bg-muted/60 px-3 py-2 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" className="rounded-full" onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" className="rounded-full" disabled={!reason || send.isPending}>
              {send.isPending && <Loader2Icon className="size-4 animate-spin" />} Enviar reporte
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
