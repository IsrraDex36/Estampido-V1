import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { DatabaseSync, SQLInputValue, StatementSync } from "node:sqlite";
import type { CommunityCategory, CommunityStats, CreatorRef } from "../contract.js";
import { openCommunityDb, transaction } from "./db.js";
import {
  decodeCursor,
  encodeCursor,
  type FeedQuery,
  PERIOD_MS,
  type Rankable,
  scoreOf,
  searchText,
  searchWords,
} from "./feed.js";

export interface StoredSticker extends Rankable {
  /** webp + ogg size (for the storage cap). */
  bytes?: number;
  animated: boolean;
  /** Seconds of sound; null = silent. */
  soundSec: number | null;
  soundOrigin: string | null;
  /** false = «solo el sonido» (hidden from the sticker feed). */
  listed?: boolean;
  /** Times it was sent to someone's WhatsApp (trending signal). */
  sends?: number;
  /** Times people saved it (favorites). */
  saves?: number;
  /** Account that published it (null: anonymous / before accounts). */
  ownerId?: string | null;
  /** Public info of the owner, joined on read. */
  creator?: CreatorRef | null;
  /** Visibility (see Visibility). Older rows: visible. */
  hidden?: Visibility;
}

/** 0 visible · 1 hidden by reports (pending review) · 2 hidden by the admin (banned creator). */
export const VISIBILITY = { visible: 0, reported: 1, banned: 2 } as const;
export type Visibility = (typeof VISIBILITY)[keyof typeof VISIBILITY];

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
  /** Publishing account, if signed in. */
  ownerId?: string | null;
}

/** The storage cap would be exceeded (→ 507). */
export class CommunityFullError extends Error {
  constructor() {
    super("La comunidad alcanzó su espacio máximo por ahora. Inténtalo más tarde.");
    this.name = "CommunityFullError";
  }
}

export type FeedPage = { items: StoredSticker[]; nextCursor: string | null } | { error: "bad_cursor" };

interface Row {
  id: string;
  title: string;
  category: string;
  tags: string;
  created_at: number;
  uses: number;
  sends: number;
  bytes: number;
  animated: number;
  sound_sec: number | null;
  sound_origin: string | null;
  listed: number;
  owner_id: string | null;
  saves: number;
  plays: number;
  hidden: number;
  c_handle: string | null;
  c_name: string | null;
  c_avatar: string | null;
}

const COLUMNS =
  "id, title, category, tags, created_at, uses, sends, bytes, animated, sound_sec, sound_origin, listed, owner_id, saves, plays, hidden";
/** eng/pop are filled by the insert trigger (db.ts). */
const INSERT = `INSERT INTO stickers (${COLUMNS}, search) VALUES (${Array(17).fill("?").join(", ")})`;
/** Sticker columns (alias s) + its creator's public fields (alias u). */
const SELECT_FULL = `SELECT ${COLUMNS.split(", ")
  .map((c) => `s.${c}`)
  .join(", ")}, u.handle AS c_handle, u.display_name AS c_name, u.avatar AS c_avatar`;
const FROM_FULL = "FROM stickers s LEFT JOIN users u ON u.id = s.owner_id";

const fromRow = (r: Row): StoredSticker => ({
  id: r.id,
  title: r.title,
  category: r.category as CommunityCategory,
  tags: JSON.parse(r.tags) as string[],
  createdAt: r.created_at,
  uses: r.uses,
  sends: r.sends,
  bytes: r.bytes,
  animated: r.animated === 1,
  soundSec: r.sound_sec,
  soundOrigin: r.sound_origin,
  listed: r.listed === 1,
  ownerId: r.owner_id,
  saves: r.saves,
  plays: r.plays,
  hidden: r.hidden as Visibility,
  creator: r.c_handle ? { handle: r.c_handle, displayName: r.c_name ?? r.c_handle, avatar: r.c_avatar ?? "" } : null,
});

/** Escape LIKE wildcards so «100%» or «a_b» are searched literally. */
const likeWord = (w: string) => `%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** SQL expression for each ordering (must equal feed.ts `scoreOf`). */
const SCORE_SQL = {
  new: "created_at",
  top: "eng",
  // Same operations, same order as feed.ts hotScore → bit-identical doubles.
  hot: "pop - MAX(0, (:asOf - created_at) / 3600000.0) / 36",
} as const;

/**
 * Community store: metadata in SQLite (<root>/community.db), files on disk
 * (<root>/<id>/sticker.{webp,ogg}). Feed pages are ranked, filtered and
 * paginated in SQL (keyset on score + id), so nothing loads the whole table.
 * An older `index.json` is imported once on first open and kept as
 * `index.json.migrated`.
 */
export class CommunityRepo {
  private dbHandle: DatabaseSync | null = null;
  private ready: Promise<void> | null = null;
  private readonly stmts = new Map<string, StatementSync>();
  /** Serializes add(): the space check and the file copy must not interleave. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    readonly root: string,
    private readonly now: () => number = Date.now,
    /** Total bytes allowed for published files (public server safety). */
    private readonly maxBytes = Number.POSITIVE_INFINITY,
  ) {}

  get dbPath(): string {
    return join(this.root, "community.db");
  }

  // ── setup ────────────────────────────────────────────────────────────────
  /** The shared connection (accounts live in the same database). */
  connection(): Promise<DatabaseSync> {
    return this.db();
  }

  private async db(): Promise<DatabaseSync> {
    this.ready ??= this.open();
    await this.ready;
    return this.dbHandle as DatabaseSync;
  }

  private async open(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    const db = openCommunityDb(this.dbPath);
    this.dbHandle = db;
    await this.importLegacyIndex(db);
  }

  /** One-time import of the old JSON index (same files, same ids). */
  private async importLegacyIndex(db: DatabaseSync): Promise<void> {
    const legacy = join(this.root, "index.json");
    const raw = await readFile(legacy, "utf8").catch(() => null);
    if (raw === null) return;
    let items: unknown[];
    try {
      const parsed = JSON.parse(raw) as unknown;
      items = Array.isArray(parsed) ? parsed : [];
    } catch {
      console.error("[community] index.json ilegible: no se importó (se deja como está).");
      return;
    }
    const insert = db.prepare(INSERT.replace("INSERT", "INSERT OR IGNORE"));
    let imported = 0;
    transaction(db, () => {
      for (const s of items as StoredSticker[]) {
        if (!s || typeof s.id !== "string" || !isCommunityId(s.id) || typeof s.title !== "string") continue;
        imported += Number(insert.run(...rowValues(s)).changes);
      }
    });
    await rename(legacy, `${legacy}.migrated`);
    console.log(`[community] ${imported} stickers importados de index.json a SQLite.`);
  }

  /** Prepared once, reused (the SQL text is the key). */
  private stmt(db: DatabaseSync, sql: string): StatementSync {
    let s = this.stmts.get(sql);
    if (!s) {
      s = db.prepare(sql);
      this.stmts.set(sql, s);
    }
    return s;
  }

  close(): void {
    this.stmts.clear();
    this.dbHandle?.close();
    this.dbHandle = null;
    this.ready = null;
  }

  // ── reads ────────────────────────────────────────────────────────────────
  async get(id: string): Promise<StoredSticker | null> {
    if (!isCommunityId(id)) return null;
    const db = await this.db();
    const row = this.stmt(db, `${SELECT_FULL} ${FROM_FULL} WHERE s.id = ?`).get(id) as Row | undefined;
    return row ? fromRow(row) : null;
  }

  /** Several by id, in the given order (missing — and, unless asked, hidden — ones skipped). */
  async getMany(ids: readonly string[], { includeHidden = false } = {}): Promise<StoredSticker[]> {
    const valid = ids.filter(isCommunityId);
    if (valid.length === 0) return [];
    const db = await this.db();
    // Only visible ones (a hidden sticker drops out of everyone's favorites view).
    const rows = this.stmt(
      db,
      `${SELECT_FULL} ${FROM_FULL} WHERE s.id IN (SELECT value FROM json_each(?))${includeHidden ? "" : " AND s.hidden = 0"}`,
    ).all(JSON.stringify(valid)) as unknown as Row[];
    const byId = new Map(rows.map((r) => [r.id, fromRow(r)]));
    return valid.flatMap((id) => byId.get(id) ?? []);
  }

  /** Most used tags on visible stickers (optionally in one category / starting with a prefix). */
  async popularTags(
    opts: { category?: string | null; prefix?: string; limit?: number } = {},
  ): Promise<{ tag: string; count: number }[]> {
    const db = await this.db();
    const where = ["s.hidden = 0", "s.listed = 1"];
    const params: SQLInputValue[] = [];
    if (opts.category) {
      where.push("s.category = ?");
      params.push(opts.category);
    }
    if (opts.prefix) {
      where.push("t.value LIKE ? ESCAPE '\\'");
      params.push(`${opts.prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    }
    params.push(Math.min(50, Math.max(1, opts.limit ?? 12)));
    return this.stmt(
      db,
      `SELECT t.value AS tag, COUNT(*) AS count FROM stickers s, json_each(s.tags) t
          WHERE ${where.join(" AND ")} GROUP BY t.value ORDER BY count DESC, t.value ASC LIMIT ?`,
    ).all(...params) as { tag: string; count: number }[];
  }

  /** Everything, newest first (owner moderation). */
  async listAll(): Promise<StoredSticker[]> {
    const db = await this.db();
    const rows = this.stmt(db, `${SELECT_FULL} ${FROM_FULL} ORDER BY s.created_at DESC, s.id DESC`).all();
    return (rows as unknown as Row[]).map(fromRow);
  }

  async usedBytes(): Promise<number> {
    const db = await this.db();
    return (this.stmt(db, "SELECT COALESCE(SUM(bytes), 0) AS n FROM stickers").get() as { n: number }).n;
  }

  async stats(): Promise<CommunityStats> {
    const db = await this.db();
    const r = this.stmt(
      db,
      "SELECT COALESCE(SUM(listed), 0) AS stickers, COUNT(sound_sec) AS sounds, COALESCE(SUM(uses), 0) AS uses FROM stickers WHERE hidden = 0",
    ).get() as { stickers: number; sounds: number; uses: number };
    return { stickers: r.stickers, sounds: r.sounds, uses: r.uses };
  }

  /**
   * One ranked page. `pool`: the sticker feed (listed) or the sounds tab
   * (has sound). Only visible stickers, unless `includeHidden` (the owner's
   * own list). Same semantics as feed.ts `pageOf` (tests compare both):
   * items newer than the first page's `asOf` stay out while scrolling, and
   * (score desc, id desc) is a total order, so pages never skip or repeat.
   */
  async page(
    query: FeedQuery,
    pool: "stickers" | "sounds" | "all",
    opts: { ownerId?: string; includeHidden?: boolean; followedBy?: string } = {},
  ): Promise<FeedPage> {
    let cursor: ReturnType<typeof decodeCursor> = null;
    if (query.cursor) {
      cursor = decodeCursor(query.cursor);
      if (!cursor) return { error: "bad_cursor" };
    }
    const asOf = cursor?.asOf ?? this.now();
    const params: Record<string, SQLInputValue> = { asOf, limit: query.limit + 1 };
    const where = ["created_at <= :asOf"];
    if (!opts.includeHidden) where.push("hidden = 0"); // literal: matches the partial indexes
    if (pool === "stickers") where.push("listed = 1");
    if (pool === "sounds") where.push("sound_sec IS NOT NULL");
    if (opts.ownerId) {
      where.push("owner_id = :ownerId");
      params.ownerId = opts.ownerId;
    }
    if (opts.followedBy) {
      // «Siguiendo»: stickers by the creators this user follows.
      where.push("owner_id IN (SELECT followee_id FROM follows WHERE follower_id = :followedBy)");
      params.followedBy = opts.followedBy;
    }
    const period = PERIOD_MS[query.period];
    if (query.sort === "top" && Number.isFinite(period)) {
      where.push("created_at >= :minCreated");
      params.minCreated = asOf - period;
    }
    if (query.category) {
      where.push("category = :category");
      params.category = query.category;
    }
    searchWords(query.q ?? "").forEach((w, i) => {
      where.push(`search LIKE :w${i} ESCAPE '\\'`);
      params[`w${i}`] = likeWord(w);
    });
    let after = "";
    if (cursor) {
      after = "WHERE score < :cScore OR (score = :cScore AND id < :cId)";
      params.cScore = cursor.score;
      params.cId = cursor.id;
    }
    // The score is computed once per row in the subquery, then compared and sorted.
    // Rank only (id, score) — small rows sort fast — then fetch the columns of
    // the page's rows by primary key. Each score is computed once per row.
    const sql = `WITH ranked AS (
        SELECT id, ${SCORE_SQL[query.sort]} AS score FROM stickers WHERE ${where.join(" AND ")}
      ), page AS (
        SELECT id, score FROM ranked ${after} ORDER BY score DESC, id DESC LIMIT :limit
      )
      ${SELECT_FULL}
        FROM page JOIN stickers s ON s.id = page.id LEFT JOIN users u ON u.id = s.owner_id
       ORDER BY page.score DESC, page.id DESC`;
    const db = await this.db();
    const rows = this.stmt(db, sql).all(params) as unknown as Row[];
    const items = rows.slice(0, query.limit).map(fromRow);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > query.limit && last
          ? encodeCursor({ asOf, score: scoreOf(last, query.sort, asOf), id: last.id })
          : null,
    };
  }

  // ── writes ───────────────────────────────────────────────────────────────
  add(input: NewSticker): Promise<StoredSticker> {
    const run = this.queue.then(() => this.addNow(input));
    this.queue = run.catch(() => {});
    return run;
  }

  private async addNow(input: NewSticker): Promise<StoredSticker> {
    const db = await this.db();
    const incoming = (await stat(input.webpPath)).size + (input.oggPath ? (await stat(input.oggPath)).size : 0);
    if ((await this.usedBytes()) + incoming > this.maxBytes) throw new CommunityFullError();
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
        sends: 0,
        plays: 0,
        hidden: VISIBILITY.visible,
        bytes: incoming,
        animated: input.animated,
        soundSec: input.oggPath ? input.soundSec : null,
        soundOrigin: input.soundOrigin,
        listed: input.listed !== false,
        ownerId: input.ownerId ?? null,
        saves: 0,
      };
      // Files first, row last: a visible row always has its files.
      this.stmt(db, INSERT).run(...rowValues(item));
      return item;
    } catch (err) {
      await rm(dir, { recursive: true, force: true });
      throw err;
    }
  }

  /** +1 «sent to WhatsApp». Returns the new count, or null if there is no such sticker. */
  async recordSend(id: string): Promise<number | null> {
    if (!isCommunityId(id)) return null;
    const db = await this.db();
    const row = this.stmt(db, "UPDATE stickers SET sends = sends + 1 WHERE id = ? AND hidden = 0 RETURNING sends").get(
      id,
    );
    return (row as { sends: number } | undefined)?.sends ?? null;
  }

  /** +1 use of a sound. Returns the new count, or null if there is no such sound. */
  async recordUse(id: string): Promise<number | null> {
    if (!isCommunityId(id)) return null;
    const db = await this.db();
    const row = this.stmt(
      db,
      "UPDATE stickers SET uses = uses + 1 WHERE id = ? AND sound_sec IS NOT NULL AND hidden = 0 RETURNING uses",
    ).get(id);
    return (row as { uses: number } | undefined)?.uses ?? null;
  }

  /**
   * Someone listened. Counts once per viewer per sticker per (UTC) day, so
   * replaying or refreshing can't pump the ranking. Returns whether it counted;
   * null if there is no such (visible) sticker.
   */
  async recordPlay(id: string, viewer: string): Promise<boolean | null> {
    if (!isCommunityId(id) || !viewer) return null;
    const db = await this.db();
    const day = Math.floor(this.now() / 86_400_000);
    return transaction(db, () => {
      const exists = this.stmt(db, "SELECT 1 AS ok FROM stickers WHERE id = ? AND hidden = 0").get(id);
      if (!exists) return null;
      const fresh = this.stmt(db, "INSERT OR IGNORE INTO play_marks (sticker_id, viewer, day) VALUES (?, ?, ?)").run(
        id,
        viewer,
        day,
      ).changes;
      if (Number(fresh) === 0) return false;
      this.stmt(db, "UPDATE stickers SET plays = plays + 1 WHERE id = ?").run(id);
      return true;
    });
  }

  /** Play marks only matter for «today»: drop the old ones. */
  async purgePlayMarks(): Promise<number> {
    const db = await this.db();
    const today = Math.floor(this.now() / 86_400_000);
    return Number(this.stmt(db, "DELETE FROM play_marks WHERE day < ?").run(today - 1).changes);
  }

  /** Owner moderation: delete one sticker (row + files). false if it doesn't exist. */
  async remove(id: string): Promise<boolean> {
    if (!isCommunityId(id)) return false;
    const db = await this.db();
    const { changes } = this.stmt(db, "DELETE FROM stickers WHERE id = ?").run(id);
    if (Number(changes) === 0) return false;
    // Row first: a crash leaves orphan files, never a row without files.
    await rm(join(this.root, id), { recursive: true, force: true });
    return true;
  }

  /** Owner moderation: delete every sticker. Returns how many were removed. */
  async clear(): Promise<number> {
    const db = await this.db();
    const ids = transaction(db, () => {
      const rows = this.stmt(db, "SELECT id FROM stickers").all() as unknown as { id: string }[];
      this.stmt(db, "DELETE FROM stickers").run();
      return rows.map((r) => r.id);
    });
    await Promise.all(ids.filter(isCommunityId).map((id) => rm(join(this.root, id), { recursive: true, force: true })));
    return ids.length;
  }

  /** Absolute path of a servable file that exists, else null. */
  async resolveFile(id: string, file: string): Promise<{ path: string; size: number } | null> {
    if (!isCommunityId(id) || !(file in COMMUNITY_FILES)) return null;
    const path = join(this.root, id, file);
    const info = await stat(path).catch(() => null);
    return info ? { path, size: info.size } : null;
  }
}

function rowValues(s: StoredSticker): SQLInputValue[] {
  const tags = Array.isArray(s.tags) ? s.tags.filter((t) => typeof t === "string") : [];
  return [
    s.id,
    s.title,
    s.category,
    JSON.stringify(tags),
    Math.round(Number(s.createdAt) || 0),
    Math.max(0, Math.round(s.uses ?? 0)),
    Math.max(0, Math.round(s.sends ?? 0)),
    Math.max(0, Math.round(s.bytes ?? 0)),
    s.animated ? 1 : 0,
    typeof s.soundSec === "number" ? s.soundSec : null,
    s.soundOrigin ?? null,
    s.listed === false ? 0 : 1,
    s.ownerId ?? null,
    Math.max(0, Math.round(s.saves ?? 0)),
    Math.max(0, Math.round(s.plays ?? 0)),
    s.hidden ?? VISIBILITY.visible,
    searchText({ title: s.title, tags, category: s.category }),
  ];
}
