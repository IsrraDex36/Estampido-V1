import { useCallback, useRef, useState } from "react";
import { sendToWhatsApp } from "@/lib/api";
import { type BatchResult, runBatch } from "./batch";

export type BatchPhase =
  | { kind: "idle" }
  | { kind: "sending"; done: number; total: number }
  | ({ kind: "finished" } & BatchResult);

/** React state around runBatch (sequential native sends through the single-send endpoint). */
export function useBatchSend(sendOne: (id: string) => Promise<unknown> = sendToWhatsApp) {
  const [phase, setPhase] = useState<BatchPhase>({ kind: "idle" });
  const cancelled = useRef(false);

  const send = useCallback(
    async (ids: string[]): Promise<BatchPhase> => {
      cancelled.current = false;
      setPhase({ kind: "sending", done: 0, total: ids.length });
      const result = await runBatch(ids, sendOne, {
        isCancelled: () => cancelled.current,
        onProgress: (done, total) => setPhase({ kind: "sending", done, total }),
      });
      const final: BatchPhase = { kind: "finished", ...result };
      setPhase(final);
      return final;
    },
    [sendOne],
  );

  const cancel = useCallback(() => {
    cancelled.current = true;
  }, []);
  const reset = useCallback(() => setPhase({ kind: "idle" }), []);

  return { phase, send, cancel, reset };
}
