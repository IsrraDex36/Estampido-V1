/** Sliding-window limiter: at most `max` hits per `windowMs` per key. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    readonly max: number,
    readonly windowMs = 60_000,
  ) {}

  /** Records a hit if allowed. Returns 0 when allowed, else ms to wait. */
  take(key: string, now = Date.now()): number {
    if (this.hits.size > 10_000) this.prune(now); // public server: never grow unbounded
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return this.windowMs - (now - (recent[0] as number));
    }
    recent.push(now);
    this.hits.set(key, recent);
    return 0;
  }

  /** Would a hit be allowed now? (ms to wait, 0 = yes) — without recording one. */
  peek(key: string, now = Date.now()): number {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    return recent.length >= this.max ? this.windowMs - (now - (recent[0] as number)) : 0;
  }

  /** Drop keys with no hit inside the window. */
  prune(now = Date.now()): void {
    for (const [key, times] of this.hits) {
      if (!times.some((t) => now - t < this.windowMs)) this.hits.delete(key);
    }
  }

  get size(): number {
    return this.hits.size;
  }
}
