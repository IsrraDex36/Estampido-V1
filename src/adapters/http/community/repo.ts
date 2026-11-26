import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CommunityCategory } from "../contract.js";
import type { Rankable } from "./feed.js";

export interface StoredSticker extends Rankable {
  /** webp + ogg size (for the storage cap). Older entries may lack it. */
  bytes?: number;
  animated: boolean;
  /** Seconds of sound; null = silent. */
  soundSec: number | null;
  soundOrigin: string | null;
  /** false = «solo el sonido» (hidden from the sticker feed). Older entries lack it (= listed). */
  listed?: boolean;
  /** Times it was sent to someone's WhatsApp (trending signal; older entries lack it). */
  sends?: number;
}

export const COMMUNITY_FILES = { "sticker.webp": "image/webp", "sticker.ogg": "audio/ogg" } as const;
export type CommunityFile = keyof typeof COMMUNITY_FILES;

const ID_RE = /^[0-9a-f-]{36}$/;
export const isCommunityId = (id: string): boolean => ID_RE.test(id);

export interface NewSticker {
  title: string;
  category: CommunityCategory;
  tags: string[];
  animated: boolean;
  soundSec: number | null;
  soundOrigin: string | null;
  /** false = «solo el sonido». Default true. */
  listed?: boolean;
  /** Files to copy in (from the 30-min result dir). */
  webpPath: string;
  oggPath: string | null;
}

/**
 * Local file-backed community store: <root>/index.json + <root>/<id>/sticker.{webp,ogg}.
 * All mutations run one at a time and the index is written atomically
 * (tmp + rename), so a crash never leaves a half-written index.
 * Swappable for a database later behind the same methods.
 */
/** The storage cap would be exceeded (→ 507). */
export class CommunityFullError extends Error {
  constructor() {
    super("La comunidad alcanzó su espacio máximo por ahora. Inténtalo más tarde.");
    this.name = "CommunityFullError";
  }
}

export class CommunityRepo {
  private items: StoredSticker[] | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    readonly root: string,
    private readonly now: () => number = Date.now,
    /** Total bytes allowed for published files (public server safety). */
    private readonly maxBytes = Number.POSITIVE_INFINITY,
  ) {}

  async usedBytes(): Promise<number> {
    return (await this.load()).reduce((n, s) => n + (s.bytes ?? 0), 0);
  }

  private get indexPath(): string {
    return join(this.root, "index.json");
  }

  private async load(): Promise<StoredSticker[]> {
    if (this.items) return this.items;
    const raw = await readFile(this.indexPath, "utf8").catch(() => "[]");
    try {
      const parsed = JSON.parse(raw);
      this.items = Array.isArray(parsed) ? (parsed as StoredSticker[]) : [];
    } catch {
      this.items = [];
    }
    return this.items;
  }

  private async persist(items: StoredSticker[]): Promise<void> {
    await mkdir(this.root, { recursive: true });
    const tmp = `${this.indexPath}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(items));
    await rename(tmp, this.indexPath);
  }

  /** Serialize mutations (read-modify-write of the index). */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  async list(): Promise<readonly StoredSticker[]> {
    return this.load();
  }

  async get(id: string): Promise<StoredSticker | null> {
    if (!isCommunityId(id)) return null;
    return (await this.load()).find((s) => s.id === id) ?? null;
  }

  add(input: NewSticker): Promise<StoredSticker> {
    return this.exclusive(async () => {
      const items = await this.load();
      const incoming = (await stat(input.webpPath)).size + (input.oggPath ? (await stat(input.oggPath)).size : 0);
      if (items.reduce((n, s) => n + (s.bytes ?? 0), 0) + incoming > this.maxBytes) throw new CommunityFullError();
      const id = randomUUID();
      const dir = join(this.root, id);
      await mkdir(dir, { recursive: true });
      try {
        await copyFile(input.webpPath, join(dir, "sticker.webp"));
        if (input.oggPath) await copyFile(input.oggPath, join(dir, "sticker.ogg"));
        const item: StoredSticker = {
          id,
          title: input.title,
          category: input.category,
          tags: input.tags,
          createdAt: this.now(),
          uses: 0,
          bytes: incoming,
          animated: input.animated,
          soundSec: input.oggPath ? input.soundSec : null,
          soundOrigin: input.soundOrigin,
          ...(input.listed === false ? { listed: false } : {}),
        };
        const next = [...items, item];
        await this.persist(next);
        this.items = next;
        return item;
      } catch (err) {
        await rm(dir, { recursive: true, force: true });
        throw err;
      }
    });
  }

  /** +1 «sent to WhatsApp». Returns the new count, or null if there is no such sticker. */
  recordSend(id: string): Promise<number | null> {
    return this.exclusive(async () => {
      const items = await this.load();
      const i = items.findIndex((s) => s.id === id);
      if (i === -1) return null;
      const next = items.map((s, j) => (j === i ? { ...s, sends: (s.sends ?? 0) + 1 } : s));
      await this.persist(next);
      this.items = next;
      return next[i]?.sends ?? null;
    });
  }

  /** +1 use of a sound. Returns the new count, or null if there is no such sound. */
  recordUse(id: string): Promise<number | null> {
    return this.exclusive(async () => {
      const items = await this.load();
      const i = items.findIndex((s) => s.id === id && s.soundSec !== null);
      if (i === -1) return null;
      const next = items.map((s, j) => (j === i ? { ...s, uses: s.uses + 1 } : s));
      await this.persist(next);
      this.items = next;
      return next[i]?.uses ?? null;
    });
  }

  /** Owner moderation: delete one sticker (index entry + files). false if it doesn't exist. */
  remove(id: string): Promise<boolean> {
    return this.exclusive(async () => {
      if (!isCommunityId(id)) return false;
      const items = await this.load();
      if (!items.some((s) => s.id === id)) return false;
      const next = items.filter((s) => s.id !== id);
      await this.persist(next); // index first: a crash leaves orphan files, never a broken entry
      this.items = next;
      await rm(join(this.root, id), { recursive: true, force: true });
      return true;
    });
  }

  /** Owner moderation: delete every sticker. Returns how many were removed. */
  clear(): Promise<number> {
    return this.exclusive(async () => {
      const items = await this.load();
      await this.persist([]);
      this.items = [];
      await Promise.all(
        items
          .filter((s) => isCommunityId(s.id))
          .map((s) => rm(join(this.root, s.id), { recursive: true, force: true })),
      );
      return items.length;
    });
  }

  /** Absolute path of a servable file that exists, else null. */
  async resolveFile(id: string, file: string): Promise<{ path: string; size: number } | null> {
    if (!isCommunityId(id) || !(file in COMMUNITY_FILES)) return null;
    const path = join(this.root, id, file);
    const info = await stat(path).catch(() => null);
    return info ? { path, size: info.size } : null;
  }
}
