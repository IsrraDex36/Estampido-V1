/** Tiny async semaphore to cap concurrent ffmpeg jobs. */
export class Semaphore {
  private active = 0;
  private readonly queue: (() => void)[] = [];

  constructor(readonly limit: number) {}

  get pending(): number {
    return this.queue.length;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}
