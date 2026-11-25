import { CancelledError } from "../core/errors.js";

/** Tiny async semaphore to cap concurrent ffmpeg jobs; waits are cancellable. */
export class Semaphore {
  private active = 0;
  private readonly queue: (() => void)[] = [];

  constructor(readonly limit: number) {}

  /** Jobs waiting for a slot. */
  get pending(): number {
    return this.queue.length;
  }

  /** True when a new job would have to wait. */
  get saturated(): boolean {
    return this.active >= this.limit;
  }

  /**
   * Run `fn` when a slot is free. `onQueued(position)` fires if it has to wait
   * (1 = next). An aborted `signal` leaves the queue without running.
   */
  async run<T>(
    fn: () => Promise<T>,
    opts: { signal?: AbortSignal; onQueued?: (position: number) => void } = {},
  ): Promise<T> {
    const { signal, onQueued } = opts;
    if (signal?.aborted) throw new CancelledError();
    if (this.active >= this.limit) {
      onQueued?.(this.queue.length + 1);
      await new Promise<void>((resolve, reject) => {
        const wake = () => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        };
        const onAbort = () => {
          const i = this.queue.indexOf(wake);
          if (i >= 0) this.queue.splice(i, 1);
          reject(new CancelledError());
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        this.queue.push(wake);
      });
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}
