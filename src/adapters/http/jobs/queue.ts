import { CancelledError } from "../../../core/errors.js";

/**
 * The conversion queue: the one place that decides who converts, when, and
 * who has to come back later. FFmpeg is CPU-bound, so throughput is set by
 * the cores; everything else is about staying fair and predictable when many
 * people press «Crear» at once:
 *
 * - bounded concurrency (≈ cores): more parallel jobs only make every job slower;
 * - admission control *before* reading the upload: one job per person, a
 *   bounded line that also counts uploads still arriving (RAM), and a cap on
 *   the estimated wait — beyond it, answer «busy, retry in N s» right away
 *   (load shedding) instead of letting requests pile up and time out;
 * - FIFO with live position and an ETA from a moving average of real job times;
 * - a hard time limit per job (a stuck FFmpeg never holds a slot forever);
 * - cancellation anywhere (waiting or running) frees the place immediately.
 */
export interface QueueOptions {
  /** Jobs converting at the same time (default 2 = a 2-vCPU server). */
  concurrency: number;
  /** People waiting (incl. uploads in progress) beyond the running ones. */
  maxQueued: number;
  /** Refuse new work when the estimated wait would exceed this. */
  maxWaitSec: number;
  /** Abort a job running longer than this. */
  jobTimeoutSec: number;
  /** Starting guess for a job's duration (refined by real ones). */
  initialJobSec?: number;
  now?: () => number;
}

export type Admission =
  | { ok: true; ticket: Ticket }
  | { ok: false; code: "one_at_a_time"; retryAfterSec: number }
  | { ok: false; code: "busy"; retryAfterSec: number; etaSec: number };

/**
 * A reserved place (taken while the upload arrives). `release()` gives it
 * back if the request fails before running; after `run()` it's a no-op.
 */
export interface Ticket {
  readonly client: string;
  release(): void;
}

class Reservation implements Ticket {
  used = false;
  constructor(
    readonly client: string,
    private readonly free: () => void,
  ) {}
  release(): void {
    if (this.used) return;
    this.used = true;
    this.free();
  }
}

export class JobTimeoutError extends Error {
  constructor(sec: number) {
    super(`La conversión tardó más de ${sec} s.`);
    this.name = "JobTimeoutError";
  }
}

interface Waiting {
  client: string;
  start: () => void;
}

export interface QueueSnapshot {
  concurrency: number;
  active: number;
  waiting: number;
  /** Estimated seconds a NEW job would wait before starting. */
  etaSec: number;
  /** Average job duration (s), from recent jobs. */
  avgJobSec: number;
  /** New work would be refused right now. */
  full: boolean;
}

export class ConversionQueue {
  private active = 0;
  private readonly line: Waiting[] = [];
  /** Clients with a reservation, a waiting job or a running job. */
  private readonly busyClients = new Set<string>();
  /** Reserved places whose upload hasn't been queued yet. */
  private reserved = 0;
  private avgMs: number;
  private readonly now: () => number;

  constructor(private readonly opts: QueueOptions) {
    this.now = opts.now ?? Date.now;
    this.avgMs = (opts.initialJobSec ?? 8) * 1000;
  }

  /** Estimated wait (s) for the job at 0-based place `ahead` in line. */
  private etaFor(ahead: number): number {
    const free = Math.max(0, this.opts.concurrency - this.active);
    if (ahead < free) return 0;
    // Each «round» frees `concurrency` slots in ~avg time.
    const rounds = Math.floor((ahead - free) / this.opts.concurrency) + 1;
    return Math.round((rounds * this.avgMs) / 1000);
  }

  snapshot(): QueueSnapshot {
    const waiting = this.line.length + this.reserved;
    const etaSec = this.etaFor(waiting);
    return {
      concurrency: this.opts.concurrency,
      active: this.active,
      waiting,
      etaSec,
      avgJobSec: Math.round(this.avgMs / 100) / 10,
      full:
        waiting >= this.opts.maxQueued + Math.max(0, this.opts.concurrency - this.active) ||
        etaSec > this.opts.maxWaitSec,
    };
  }

  /**
   * Ask for a place. Call BEFORE reading the upload: a refusal costs nothing.
   * The ticket holds the place while the upload arrives.
   */
  admit(client: string): Admission {
    if (this.busyClients.has(client))
      return { ok: false, code: "one_at_a_time", retryAfterSec: Math.ceil(this.avgMs / 1000) };
    const snap = this.snapshot();
    if (snap.full) {
      // Come back when roughly one round has finished.
      return { ok: false, code: "busy", retryAfterSec: Math.max(5, Math.ceil(this.avgMs / 1000)), etaSec: snap.etaSec };
    }
    this.busyClients.add(client);
    this.reserved++;
    return {
      ok: true,
      ticket: new Reservation(client, () => {
        this.reserved--;
        this.busyClients.delete(client);
      }),
    };
  }

  /** 1-based position of a waiting client (0 = running or unknown). */
  positionOf(client: string): number {
    const i = this.line.findIndex((w) => w.client === client);
    return i === -1 ? 0 : i + 1;
  }

  /** Estimated seconds until `client`'s job starts (0 if running). */
  etaOf(client: string): number {
    const i = this.line.findIndex((w) => w.client === client);
    return i === -1 ? 0 : this.etaFor(i);
  }

  /**
   * Run `fn` for a ticket: waits its turn, then runs with a signal that aborts
   * on the caller's signal OR the time limit. The place is freed when it ends.
   */
  async run<T>(
    ticket: Ticket,
    fn: (signal: AbortSignal) => Promise<T>,
    opts: { signal?: AbortSignal; onStart?: () => void } = {},
  ): Promise<T> {
    if (!(ticket instanceof Reservation) || ticket.used) throw new Error("Ticket ya usado o inválido.");
    // The reservation becomes a real place in line (or a running slot).
    ticket.used = true;
    this.reserved--;
    try {
      if (opts.signal?.aborted) throw new CancelledError();
      if (this.active >= this.opts.concurrency) await this.waitTurn(ticket.client, opts.signal);
      this.active++;
      opts.onStart?.();
      const started = this.now();
      const ctrl = new AbortController();
      const onAbort = () => ctrl.abort(opts.signal?.reason);
      opts.signal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(
        () => ctrl.abort(new JobTimeoutError(this.opts.jobTimeoutSec)),
        this.opts.jobTimeoutSec * 1000,
      );
      timer.unref?.();
      try {
        const out = await fn(ctrl.signal);
        this.learn(this.now() - started);
        return out;
      } catch (err) {
        if (ctrl.signal.reason instanceof JobTimeoutError) throw ctrl.signal.reason;
        throw err;
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener("abort", onAbort);
        this.active--;
        this.line.shift()?.start();
      }
    } finally {
      this.busyClients.delete(ticket.client);
    }
  }

  private waitTurn(client: string, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const entry: Waiting = {
        client,
        start: () => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        },
      };
      const onAbort = () => {
        const i = this.line.indexOf(entry);
        if (i >= 0) this.line.splice(i, 1);
        reject(new CancelledError());
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      this.line.push(entry);
    });
  }

  /** Exponential moving average of job time (recent jobs weigh more). */
  private learn(ms: number): void {
    this.avgMs = Math.round(this.avgMs * 0.7 + ms * 0.3);
  }
}
