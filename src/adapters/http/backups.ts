import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import type { CommunityRepo } from "./community/repo.js";

/**
 * Daily backups of the community database (stickers index, accounts,
 * follows, packs, reports…). `VACUUM INTO` writes a consistent snapshot
 * while the app keeps running (WAL), then it's gzipped. Kept: the last 7
 * days + one per week for 4 weeks. The owner downloads the latest from
 * /admin to keep a copy OFF the server (a server backup can't survive the
 * server). Sticker files are big: for those, use the host's snapshots.
 */
export interface BackupInfo {
  name: string;
  bytes: number;
  /** Day it represents (YYYY-MM-DD, UTC). */
  day: string;
}

const NAME_RE = /^community-(\d{4}-\d{2}-\d{2})\.db\.gz$/;
export const dayOf = (t: number): string => new Date(t).toISOString().slice(0, 10);

/** ISO-ish week key (Monday-based) for a YYYY-MM-DD day. Pure. */
export function weekOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
  return dayOf(monday.getTime());
}

/** Which backups to delete: keep the newest `daily` days + the newest of each of the last `weekly` weeks. Pure. */
export function toPrune(days: string[], daily = 7, weekly = 4): string[] {
  const sorted = [...new Set(days)].sort().reverse(); // newest first
  const keep = new Set(sorted.slice(0, daily));
  const weeks = new Set<string>();
  for (const d of sorted) {
    const w = weekOf(d);
    if (weeks.has(w)) continue;
    if (weeks.size >= weekly) break;
    weeks.add(w);
    keep.add(d);
  }
  return sorted.filter((d) => !keep.has(d));
}

export class Backups {
  private running: Promise<BackupInfo> | null = null;

  constructor(
    readonly dir: string,
    private readonly repo: CommunityRepo,
    private readonly now: () => number = Date.now,
  ) {}

  async list(): Promise<BackupInfo[]> {
    const names = await readdir(this.dir).catch(() => [] as string[]);
    const out: BackupInfo[] = [];
    for (const name of names) {
      const m = NAME_RE.exec(name);
      if (!m) continue;
      const s = await stat(join(this.dir, name)).catch(() => null);
      if (s) out.push({ name, bytes: s.size, day: m[1] as string });
    }
    return out.sort((a, b) => b.day.localeCompare(a.day));
  }

  /** Path of a backup file by name (validated), or null. */
  pathOf(name: string): string | null {
    return NAME_RE.test(name) ? join(this.dir, name) : null;
  }

  /** Make today's backup now (one at a time; re-running the same day replaces it). */
  run(): Promise<BackupInfo> {
    this.running ??= this.make().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async make(): Promise<BackupInfo> {
    await mkdir(this.dir, { recursive: true });
    const day = dayOf(this.now());
    const name = `community-${day}.db.gz`;
    const raw = join(this.dir, `.snapshot-${process.pid}.db`);
    const tmp = join(this.dir, `.${name}.${process.pid}.tmp`);
    try {
      await rm(raw, { force: true });
      const db = await this.repo.connection();
      db.exec(`VACUUM INTO '${raw.replace(/'/g, "''")}'`);
      await pipeline(createReadStream(raw), createGzip({ level: 9 }), createWriteStream(tmp));
      await rename(tmp, join(this.dir, name));
    } finally {
      await rm(raw, { force: true });
      await rm(tmp, { force: true });
    }
    const all = await this.list();
    for (const d of toPrune(all.map((b) => b.day))) await rm(join(this.dir, `community-${d}.db.gz`), { force: true });
    return (await this.list()).find((b) => b.name === name) as BackupInfo;
  }

  /** Check hourly; make the day's backup once (at start, too). Returns stop(). */
  start(everyMs = 3_600_000): () => void {
    const tick = async () => {
      const today = dayOf(this.now());
      if ((await this.list()).some((b) => b.day === today)) return;
      await this.run().catch((err) => console.error("[respaldo]", err));
    };
    void tick();
    const id = setInterval(() => void tick(), everyMs);
    id.unref?.();
    return () => clearInterval(id);
  }
}
