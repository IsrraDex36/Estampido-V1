import type { Me } from "@contract";
import { clientHeaders, readJson } from "@/lib/api";
import { useSelfStore } from "./selfStore";

const json = () => ({ ...clientHeaders(), "content-type": "application/json" });

export type LinkStatus =
  | { state: "waiting" }
  | { state: "qr"; qrSvg: string }
  | { state: "code"; code: string }
  /** The phone accepted; finishing (seconds). */
  | { state: "pairing"; step: "connecting" | "preparing" }
  /** `me`: linking also signs you in (null if the account is blocked). */
  | { state: "linked"; session: string; me?: Me | null }
  | { state: "failed"; reason: string };

export async function startLink(phone?: string): Promise<string> {
  const r = await readJson<{ id: string }>(
    await fetch("/api/self/link", { method: "POST", headers: json(), body: JSON.stringify(phone ? { phone } : {}) }),
  );
  return r.id;
}

export async function linkStatus(id: string): Promise<LinkStatus> {
  return readJson(await fetch(`/api/self/link/${encodeURIComponent(id)}`, { cache: "no-store", headers: clientHeaders() }));
}

export type SendWhat = { results?: string[]; community?: string[]; pack?: string };

/** What happened to everything asked for: sent + failed + pending + skipped = requested. */
export interface SendSummary {
  requested: number;
  sent: number;
  /** Tried, didn't arrive. */
  failed: number;
  /** Not tried (time ran out, or the send stopped): can be sent again. */
  pending: number;
  /** Expired / deleted / hidden: can't be sent anymore. */
  skipped: number;
}

/** Stickers per request: short requests, live progress, never near a time limit. */
export const SEND_BATCH = 10;

/** A send error that still reports what DID arrive, and what's left to send. */
export class PartialSendError extends Error {
  override readonly cause: unknown;
  readonly summary: SendSummary;
  readonly remaining: SendWhat;
  constructor(cause: unknown, summary: SendSummary, remaining: SendWhat) {
    super(cause instanceof Error ? cause.message : "No se pudo enviar a tu chat.");
    this.cause = cause;
    this.summary = summary;
    this.remaining = remaining;
  }
}

let chain: Promise<unknown> = Promise.resolve();
/**
 * One send at a time in this browser — across tabs too (Web Locks). Every send
 * renews the sealed session; two sends starting from the same session would
 * fork the encryption state (the second overwrites the first's keys).
 */
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (locks?.request) return locks.request("estampido-self-send", fn) as Promise<T>;
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

/**
 * Send to your own chat, in batches, always from the latest session (renewed
 * after every batch). `onProgress(done, total)` after each batch.
 */
export function sendToSelf(what: SendWhat, onProgress?: (done: number, total: number) => void): Promise<SendSummary> {
  return exclusive(async () => {
    await useSelfStore.persist.rehydrate(); // another tab may have renewed the session meanwhile
    const items = [
      ...[...new Set(what.results ?? [])].map((id) => ({ kind: "results" as const, id })),
      ...[...new Set(what.community ?? [])].map((id) => ({ kind: "community" as const, id })),
    ];
    const total = items.length;
    const sum: SendSummary = { requested: total, sent: 0, failed: 0, pending: 0, skipped: 0 };
    for (let at = 0; at < total; at += SEND_BATCH) {
      const batch = items.slice(at, at + SEND_BATCH);
      const rest = items.slice(at);
      const remaining = (list: typeof items): SendWhat => ({
        results: list.filter((i) => i.kind === "results").map((i) => i.id),
        community: list.filter((i) => i.kind === "community").map((i) => i.id),
        ...(what.pack ? { pack: what.pack } : {}),
      });
      const session = useSelfStore.getState().session;
      if (!session) throw new PartialSendError(new Error("not_linked"), { ...sum, pending: rest.length }, remaining(rest));
      try {
        const body = { session, ...remaining(batch) };
        const r = await readJson<{ sent: number; failed?: number; pending?: number; skipped?: number; session: string }>(
          await fetch("/api/self/send", { method: "POST", headers: json(), body: JSON.stringify(body) }),
        );
        useSelfStore.getState().setSession(r.session);
        sum.sent += r.sent;
        sum.failed += r.failed ?? 0;
        sum.skipped += r.skipped ?? 0;
        const pending = r.pending ?? 0;
        if (pending > 0) {
          // The server ran out of time: the rest (this batch's tail + later batches) waits.
          sum.pending += pending + (total - at - batch.length);
          return sum;
        }
      } catch (err) {
        throw new PartialSendError(err, { ...sum, pending: rest.length }, remaining(rest));
      }
      onProgress?.(Math.min(total, at + batch.length), total);
    }
    return sum;
  });
}

/** Remove this device from your WhatsApp and forget the session here. */
export async function unlinkSelf(): Promise<void> {
  await forgetSelf().device;
}

/**
 * Forget the session in this browser NOW (synchronously: nothing can sign back
 * in with it), and ask WhatsApp to remove the device in the background — that
 * takes seconds and must never hold the UI (`device` resolves when done).
 */
export function forgetSelf(): { device: Promise<void> } {
  const session = useSelfStore.getState().session;
  useSelfStore.getState().setSession(null);
  if (!session) return { device: Promise.resolve() };
  const device = fetch("/api/self/logout", {
    method: "POST",
    headers: json(),
    body: JSON.stringify({ session }),
    keepalive: true, // still sent if the page closes right after signing out
  })
    .then(() => undefined)
    .catch(() => undefined);
  return { device };
}

/** Signed out but this browser is linked: sign in again with the sealed session (no WhatsApp connection). */
export async function signInWithSelf(): Promise<Me> {
  const session = useSelfStore.getState().session;
  if (!session) throw new Error("not_linked");
  return (
    await readJson<{ me: Me }>(
      await fetch("/api/self/signin", { method: "POST", headers: json(), body: JSON.stringify({ session }) }),
    )
  ).me;
}
