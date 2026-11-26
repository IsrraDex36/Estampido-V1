import { statfs } from "node:fs/promises";
import { tmpdir } from "node:os";

/**
 * Refuse heavy work (new conversions, publishing) BEFORE the machine runs out
 * of disk or memory — under attack or a traffic spike the site stays up and
 * says «try again in a moment» instead of crashing. Cheap: disk is checked at
 * most every 10 s.
 */
export interface ResourceLimits {
  /** Minimum free space (bytes) in each watched folder. */
  minFreeBytes: number;
  /** Maximum resident memory of this process (bytes). */
  maxRssBytes: number;
  dirs: string[];
}

export type ResourceProblem = "disk" | "memory" | null;

export class ResourceGuard {
  private checkedAt = Number.NEGATIVE_INFINITY; // the first call always checks
  private diskOk = true;

  constructor(
    private readonly limits: ResourceLimits,
    private readonly free: (dir: string) => Promise<number> = freeBytes,
    private readonly rss: () => number = () => process.memoryUsage().rss,
    private readonly now: () => number = Date.now,
  ) {}

  async problem(): Promise<ResourceProblem> {
    if (this.rss() > this.limits.maxRssBytes) return "memory";
    if (this.now() - this.checkedAt > 10_000) {
      this.checkedAt = this.now();
      const frees = await Promise.all(this.limits.dirs.map((d) => this.free(d).catch(() => Number.POSITIVE_INFINITY)));
      this.diskOk = frees.every((f) => f >= this.limits.minFreeBytes);
    }
    return this.diskOk ? null : "disk";
  }
}

export async function freeBytes(dir: string): Promise<number> {
  const s = await statfs(dir);
  return s.bavail * s.bsize;
}

export const defaultResourceDirs = (dataDir: string): string[] => [dataDir, tmpdir()];

export const RESOURCE_MESSAGES: Record<Exclude<ResourceProblem, null>, string> = {
  disk: "El servidor está casi sin espacio. Intenta en unos minutos.",
  memory: "El servidor está muy ocupado. Intenta en unos segundos.",
};
