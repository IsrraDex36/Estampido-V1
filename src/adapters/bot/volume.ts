import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/**
 * Outgoing volume governor with a warm-up for new numbers.
 *
 * A freshly activated number that suddenly sends a lot is the classic
 * restriction pattern, so limits start low and grow over ~a month. Within
 * the limits the pace only slows down a bit as volume rises («pressure»);
 * at a limit, sends wait until the window frees up instead of bursting.
 * Estampido only ever answers people, so these limits are rarely reached —
 * they're a safety net for spikes (a viral day, a stuck loop).
 */
export interface VolumeLimits {
  perMinute: number;
  perHour: number;
}

/** From day N of the number's life: limits. Days since the bot first connected with it. */
export const WARMUP: readonly ({ fromDay: number } & VolumeLimits)[] = [
  { fromDay: 0, perMinute: 6, perHour: 40 },
  { fromDay: 3, perMinute: 10, perHour: 90 },
  { fromDay: 7, perMinute: 16, perHour: 180 },
  { fromDay: 14, perMinute: 25, perHour: 350 },
  { fromDay: 30, perMinute: 40, perHour: 600 },
];

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function limitsFor(ageDays: number): VolumeLimits {
  let step = WARMUP[0] as (typeof WARMUP)[number];
  for (const s of WARMUP) if (ageDays >= s.fromDay) step = s;
  return { perMinute: step.perMinute, perHour: step.perHour };
}

export interface VolumeReport {
  lastMinute: number;
  lastHour: number;
  last24h: number;
  /** Day of the warm-up (0 = first day); null = number not known yet. */
  warmupDay: number | null;
  limits: VolumeLimits;
}

export class VolumeGovernor {
  /** Send timestamps of the last 24 h (ascending). */
  private sent: number[] = [];
  private firstSeen: number | null = null;

  constructor(private readonly now: () => number = Date.now) {}

  /** When this number was first used by the bot (from BotAgeStore). */
  setFirstSeen(at: number | null): void {
    this.firstSeen = at;
  }

  private prune(t: number): void {
    let i = 0;
    while (i < this.sent.length && (this.sent[i] as number) <= t - DAY) i++;
    if (i > 0) this.sent.splice(0, i);
  }

  private countSince(since: number): number {
    // sent is ascending: binary search the first ≥ since
    let lo = 0;
    let hi = this.sent.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((this.sent[mid] as number) <= since) lo = mid + 1;
      else hi = mid;
    }
    return this.sent.length - lo;
  }

  ageDays(): number {
    return this.firstSeen === null ? 0 : Math.max(0, Math.floor((this.now() - this.firstSeen) / DAY));
  }

  limits(): VolumeLimits {
    return limitsFor(this.ageDays());
  }

  record(): void {
    const t = this.now();
    this.prune(t);
    this.sent.push(t);
  }

  /** 0 = idle … 1 = at a limit (the busier of minute/hour). */
  pressure(): number {
    const t = this.now();
    const l = this.limits();
    return Math.max(this.countSince(t - MIN) / l.perMinute, this.countSince(t - HOUR) / l.perHour);
  }

  /** How long to wait before the next send fits under both limits (0 = now). */
  waitMs(): number {
    const t = this.now();
    this.prune(t);
    const l = this.limits();
    const waitFor = (window: number, max: number) => {
      const inWindow = this.countSince(t - window);
      if (inWindow < max) return 0;
      // The oldest send that must leave the window for one more to fit.
      const oldest = this.sent[this.sent.length - max] as number;
      return Math.max(0, oldest + window - t + 1);
    };
    return Math.max(waitFor(MIN, l.perMinute), waitFor(HOUR, l.perHour));
  }

  report(): VolumeReport {
    const t = this.now();
    this.prune(t);
    return {
      lastMinute: this.countSince(t - MIN),
      lastHour: this.countSince(t - HOUR),
      last24h: this.sent.length,
      warmupDay: this.firstSeen === null ? null : this.ageDays(),
      limits: this.limits(),
    };
  }
}

/** Remembers when the bot first used each number (survives restarts and redeploys). */
export class BotAgeStore {
  constructor(
    readonly file = resolve(process.env.SVA_DATA_DIR ?? ".data", "bot-age.json"),
    private readonly now: () => number = Date.now,
  ) {}

  /** First-seen time for this number; records «now» the first time. */
  async firstSeen(digits: string): Promise<number> {
    const all = await readFile(this.file, "utf8")
      .then((s) => JSON.parse(s) as Record<string, number>)
      .catch(() => ({}) as Record<string, number>);
    const known = all[digits];
    if (typeof known === "number" && Number.isFinite(known)) return known;
    const at = this.now();
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify({ ...all, [digits]: at }), { mode: 0o600 });
    await rename(tmp, this.file);
    return at;
  }
}
