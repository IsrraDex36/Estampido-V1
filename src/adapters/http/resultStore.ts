import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { RESULTS_ROOT } from "../../config/paths.js";

/** Only these files can ever be served back. */
export const SERVABLE_FILES = {
  "sticker.webp": "image/webp",
  "sticker.ogg": "audio/ogg",
  /** Built on demand by GET /results/:id/whatsapp.mp4. */
  "whatsapp.mp4": "video/mp4",
} as const;
export type ServableFile = keyof typeof SERVABLE_FILES;

const ID_RE = /^[0-9a-f-]{36}$/;

/**
 * Per-job working dirs under the OS temp dir, deleted after `ttlMs`.
 * IDs are random UUIDs; client input never becomes part of a path.
 */
export class ResultStore {
  constructor(
    readonly root: string = RESULTS_ROOT,
    readonly ttlMs: number = 30 * 60 * 1000,
  ) {}

  async create(): Promise<{ id: string; dir: string; expiresAt: Date }> {
    const id = randomUUID();
    const dir = join(this.root, id);
    await mkdir(dir, { recursive: true });
    return { id, dir, expiresAt: new Date(Date.now() + this.ttlMs) };
  }

  /** Absolute path for a servable file, or null if id/file is invalid. */
  resolve(id: string, file: string): string | null {
    if (!ID_RE.test(id) || !(file in SERVABLE_FILES)) return null;
    return join(this.root, id, file);
  }

  async remove(id: string): Promise<void> {
    if (ID_RE.test(id)) await rm(join(this.root, id), { recursive: true, force: true });
  }

  async sweep(now = Date.now()): Promise<number> {
    let removed = 0;
    const entries = await readdir(this.root).catch(() => [] as string[]);
    for (const id of entries) {
      if (!ID_RE.test(id)) continue;
      const { mtimeMs } = await stat(join(this.root, id)).catch(() => ({
        mtimeMs: now,
      }));
      if (now - mtimeMs > this.ttlMs) {
        await this.remove(id);
        removed++;
      }
    }
    return removed;
  }
}
