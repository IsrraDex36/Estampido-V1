import { ApiError } from "@/lib/api";

export interface BatchResult {
  sent: number;
  failed: number;
  total: number;
  stoppedReason?: string;
}

export interface BatchHooks {
  onProgress?: (done: number, total: number) => void;
  isCancelled?: () => boolean;
  gapMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Send ids one after another (order preserved, real progress). Keeps going on
 * per-item failures (e.g. one expired result) but stops when the bot is gone
 * (503) or when cancelled. Pure orchestration: transport injected.
 */
export async function runBatch(
  ids: readonly string[],
  sendOne: (id: string) => Promise<unknown>,
  { onProgress, isCancelled = () => false, gapMs = 700, sleep = defaultSleep }: BatchHooks = {},
): Promise<BatchResult> {
  let sent = 0;
  let failed = 0;
  let stoppedReason: string | undefined;
  for (const [i, id] of ids.entries()) {
    if (isCancelled()) {
      stoppedReason = "Cancelado.";
      break;
    }
    try {
      await sendOne(id);
      sent++;
    } catch (err) {
      failed++;
      if (err instanceof ApiError && (err.status === 503 || err.code === "bot_unavailable")) {
        stoppedReason = err.message;
        break;
      }
    }
    onProgress?.(i + 1, ids.length);
    if (i < ids.length - 1 && !isCancelled()) await sleep(gapMs);
  }
  return { sent, failed, total: ids.length, stoppedReason };
}
