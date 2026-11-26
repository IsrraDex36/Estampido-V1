import type { SendPace } from "@contract";

/**
 * How long sending N stickers will take. The bot paces every message (a
 * random gap) and, on a young number, caps messages per minute/hour (warm-
 * up): a 30-sticker pack can take minutes. Pure (tested).
 */
export const AVG_SEND_SEC = 1.6;

export function estimatePackSec(n: number, pace?: SendPace): number {
  if (n <= 0) return 0;
  let sec = n * AVG_SEND_SEC;
  if (pace && pace.perMinute > 0 && pace.perHour > 0) {
    const minuteLeft = Math.max(0, pace.perMinute - pace.lastMinute);
    if (n > minuteLeft) sec = Math.max(sec, Math.ceil((n - minuteLeft) / pace.perMinute) * 60);
    const hourLeft = Math.max(0, pace.perHour - pace.lastHour);
    if (n > hourLeft) sec = Math.max(sec, ((n - hourLeft) / pace.perHour) * 3600);
  }
  return Math.round(sec);
}

/**
 * Remaining time while sending: once a couple have gone, the real pace wins
 * (it already includes waits); before that, the estimate scaled down.
 */
export function remainingSec(done: number, total: number, elapsedMs: number, initialSec: number): number {
  const left = Math.max(0, total - done);
  if (left === 0) return 0;
  if (done >= 2) return Math.round((elapsedMs / 1000 / done) * left);
  return Math.round((initialSec * left) / Math.max(1, total));
}

/** «unos segundos» / «~40 s» / «~3 min» / «~1 h 10 min». Pure. */
export function etaLabel(sec: number): string {
  if (sec < 20) return "unos segundos";
  if (sec < 60) return `~${Math.round(sec / 10) * 10} s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `~${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `~${h} h ${m} min` : `~${h} h`;
}
