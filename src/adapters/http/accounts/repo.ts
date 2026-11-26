import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import { transaction } from "../community/db.js";
import { type CommunityRepo, isCommunityId } from "../community/repo.js";
import {
  AVATAR_COLORS,
  AVATAR_EMOJIS,
  type CreatorProfile,
  type CreatorStats,
  type FavoriteIds,
  type FavoriteKind,
  type Me,
  type MeUpdate,
} from "../contract.js";

export interface User {
  id: string;
  handle: string;
  displayName: string;
  bio: string;
  avatar: string;
  phoneHint: string;
  createdAt: number;
  /** Blocked by the admin: can't sign in or publish; profile and stickers hidden. */
  banned: boolean;
}

/** Session lifetime; refreshed (sliding) at most once a day while in use. */
export const SESSION_TTL_MS = 90 * 24 * 3_600_000;
const SESSION_REFRESH_MS = 24 * 3_600_000;
/** Oldest sessions beyond this are dropped (a user rarely has > 20 devices). */
const MAX_SESSIONS_PER_USER = 20;
export const MAX_FAVORITES = 200;

/** Handles nobody can take (routes, brand, impersonation bait). */
export const RESERVED_HANDLES = new Set([
  "admin",
  "administrador",
  "api",
  "app",
  "comunidad",
  "community",
  "crear",
  "estampido",
  "help",
  "ayuda",
  "me",
  "mod",
  "moderador",
  "null",
  "oficial",
  "official",
  "privacidad",
  "pum",
  "root",
  "soporte",
  "support",
  "system",
  "undefined",
  "whatsapp",
]);

export class HandleTakenError extends Error {
  constructor() {
    super("Ese nombre de usuario ya está en uso.");
    this.name = "HandleTakenError";
  }
}

interface UserRow {
  id: string;
  handle: string;
  display_name: string;
  bio: string;
  avatar: string;
  phone_hint: string;
  created_at: number;
  banned_at: number | null;
}

const fromRow = (r: UserRow): User => ({
  id: r.id,
  handle: r.handle,
  displayName: r.display_name,
  bio: r.bio,
  avatar: r.avatar,
  phoneHint: r.phone_hint,
  createdAt: r.created_at,
  banned: r.banned_at !== null,
});

const USER_COLS = "id, handle, display_name, bio, avatar, phone_hint, created_at, banned_at";
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");
const pick = <T>(list: readonly T[]): T => list[randomInt(list.length)] as T;

/**
 * Accounts on top of the WhatsApp link: one user per WhatsApp number
 * (identified by the bot's opaque account key), cookie sessions stored hashed,
 * synced favorites. Same SQLite database as the community.
 */
export class AccountRepo {
  private readonly stmts = new Map<string, StatementSync>();

  constructor(
    private readonly community: CommunityRepo,
    private readonly now: () => number = Date.now,
  ) {}

  private async db(): Promise<DatabaseSync> {
    return this.community.connection();
  }

  private async q(sql: string): Promise<StatementSync> {
    const db = await this.db();
    let s = this.stmts.get(sql);
    if (!s) {
      s = db.prepare(sql);
      this.stmts.set(sql, s);
    }
    return s;
  }

  // ── users ────────────────────────────────────────────────────────────────
  /** The user for this WhatsApp number, created on first sign-in. */
  async upsertFromLink(accountKey: string, phoneHint: string): Promise<{ user: User; created: boolean }> {
    const found = (await this.q(`SELECT ${USER_COLS} FROM users WHERE account_key = ?`)).get(accountKey) as
      | UserRow
      | undefined;
    if (found) {
      if (found.phone_hint !== phoneHint) {
        (await this.q("UPDATE users SET phone_hint = ? WHERE id = ?")).run(phoneHint, found.id);
      }
      return { user: fromRow({ ...found, phone_hint: phoneHint }), created: false };
    }
    const insert = await this.q(
      "INSERT INTO users (id, account_key, handle, display_name, avatar, phone_hint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (let attempt = 0; attempt < 20; attempt++) {
      const digits = String(randomInt(attempt < 10 ? 10_000 : 1_000_000)).padStart(4, "0");
      const handle = `creador_${digits}`;
      const id = randomUUID();
      const t = this.now();
      try {
        insert.run(
          id,
          accountKey,
          handle,
          `Creador ${digits}`,
          `${pick(AVATAR_EMOJIS)} ${pick(AVATAR_COLORS)}`,
          phoneHint,
          t,
          t,
        );
        return { user: (await this.getUser(id)) as User, created: true };
      } catch (err) {
        if (!isUnique(err)) throw err;
        // Same account created concurrently by another request → use it.
        const raced = (await this.q(`SELECT ${USER_COLS} FROM users WHERE account_key = ?`)).get(accountKey) as
          | UserRow
          | undefined;
        if (raced) return { user: fromRow(raced), created: false };
        // Otherwise the random handle was taken: try another.
      }
    }
    throw new Error("No se pudo crear la cuenta.");
  }

  async getUser(id: string): Promise<User | null> {
    const r = (await this.q(`SELECT ${USER_COLS} FROM users WHERE id = ?`)).get(id) as UserRow | undefined;
    return r ? fromRow(r) : null;
  }

  /** Public lookup: banned creators don't exist publicly (the admin passes includeBanned). */
  async byHandle(handle: string, { includeBanned = false } = {}): Promise<User | null> {
    const r = (await this.q(`SELECT ${USER_COLS} FROM users WHERE handle = ?`)).get(handle) as UserRow | undefined;
    if (!r || (r.banned_at !== null && !includeBanned)) return null;
    return fromRow(r);
  }

  async updateProfile(id: string, patch: MeUpdate): Promise<User> {
    const sets: string[] = [];
    const values: (string | number)[] = [];
    if (patch.handle !== undefined) {
      if (RESERVED_HANDLES.has(patch.handle)) throw new HandleTakenError();
      sets.push("handle = ?");
      values.push(patch.handle);
    }
    if (patch.displayName !== undefined) {
      sets.push("display_name = ?");
      values.push(patch.displayName);
    }
    if (patch.bio !== undefined) {
      sets.push("bio = ?");
      values.push(patch.bio);
    }
    if (patch.avatar !== undefined) {
      sets.push("avatar = ?");
      values.push(patch.avatar);
    }
    if (sets.length > 0) {
      try {
        // Dynamic but bounded (≤ 16 shapes): fine to cache.
        (await this.q(`UPDATE users SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`)).run(
          ...values,
          this.now(),
          id,
        );
      } catch (err) {
        if (isUnique(err)) throw new HandleTakenError();
        throw err;
      }
    }
    return (await this.getUser(id)) as User;
  }

  /** Delete the account AND everything it published (rows + files). Returns removed sticker count. */
  async deleteUser(id: string): Promise<number> {
    const db = await this.db();
    const ids = transaction(db, () => {
      const rows = db.prepare("SELECT id FROM stickers WHERE owner_id = ?").all(id) as { id: string }[];
      // Their saves on other people's stickers go away with them: keep the counters true.
      db.prepare(
        `UPDATE stickers SET saves = MAX(0, saves - (SELECT COUNT(*) FROM favorites f WHERE f.user_id = :u AND f.sticker_id = stickers.id))
          WHERE id IN (SELECT sticker_id FROM favorites WHERE user_id = :u)`,
      ).run({ u: id });
      db.prepare("DELETE FROM stickers WHERE owner_id = ?").run(id);
      db.prepare("DELETE FROM users WHERE id = ?").run(id); // sessions + favorites cascade
      return rows.map((r) => r.id);
    });
    await Promise.all(
      ids.filter(isCommunityId).map((sid) => rm(join(this.community.root, sid), { recursive: true, force: true })),
    );
    return ids.length;
  }

  /** Public numbers count visible stickers; the owner's own view counts everything. */
  async stats(userId: string, { includeHidden = false } = {}): Promise<CreatorStats> {
    const r = (
      await this.q(
        `SELECT COUNT(*) AS stickers, COALESCE(SUM(uses), 0) AS uses, COALESCE(SUM(saves), 0) AS saves,
              COALESCE(SUM(sends), 0) AS sends
         FROM stickers WHERE owner_id = ? ${includeHidden ? "" : "AND hidden = 0"}`,
      )
    ).get(userId) as unknown as CreatorStats;
    return { stickers: r.stickers, uses: r.uses, saves: r.saves, sends: r.sends };
  }

  async profile(user: User, { includeHidden = false } = {}): Promise<CreatorProfile> {
    return {
      handle: user.handle,
      displayName: user.displayName,
      avatar: user.avatar,
      bio: user.bio,
      createdAt: new Date(user.createdAt).toISOString(),
      stats: await this.stats(user.id, { includeHidden }),
      followers: await this.followers(user.id),
    };
  }

  async followers(userId: string): Promise<number> {
    return ((await this.q("SELECT COUNT(*) AS n FROM follows WHERE followee_id = ?")).get(userId) as { n: number }).n;
  }

  async me(user: User): Promise<Me> {
    return { ...(await this.profile(user, { includeHidden: true })), id: user.id, phone: user.phoneHint };
  }

  /**
   * Creators with at least one public sticker, ranked by how much the
   * community engages with their work: the sum of their stickers' trending
   * engagement (feed.ts TRENDING_WEIGHTS) plus one point per sticker.
   */
  async topCreators(limit = 8): Promise<CreatorProfile[]> {
    const rows = (
      await this.q(
        `SELECT u.${USER_COLS.split(", ").join(", u.")},
              COUNT(s.id) AS stickers, SUM(s.uses) AS uses, SUM(s.saves) AS saves, SUM(s.sends) AS sends,
              (SELECT COUNT(*) FROM follows f WHERE f.followee_id = u.id) AS followers
         FROM users u JOIN stickers s ON s.owner_id = u.id AND s.hidden = 0
        WHERE u.banned_at IS NULL
        GROUP BY u.id
       HAVING SUM(s.listed) > 0
        ORDER BY SUM(s.eng) + COUNT(s.id) DESC, u.created_at ASC
        LIMIT ?`,
      )
    ).all(limit) as unknown as (UserRow & CreatorStats & { followers: number })[];
    return rows.map((r) => ({
      handle: r.handle,
      displayName: r.display_name,
      avatar: r.avatar,
      bio: r.bio,
      createdAt: new Date(r.created_at).toISOString(),
      stats: { stickers: r.stickers, uses: r.uses, saves: r.saves, sends: r.sends },
      followers: r.followers,
    }));
  }

  // ── sessions ─────────────────────────────────────────────────────────────
  /** New session → the raw token (only the cookie has it; we keep its hash). */
  async createSession(userId: string, clientHash: string): Promise<string> {
    const db = await this.db();
    const token = randomBytes(32).toString("base64url");
    const t = this.now();
    transaction(db, () => {
      // One session per browser: signing in again replaces it.
      db.prepare("DELETE FROM sessions WHERE user_id = ? AND client_hash = ?").run(userId, clientHash);
      db.prepare(
        "INSERT INTO sessions (token_hash, user_id, client_hash, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(hashToken(token), userId, clientHash, t, t, t + SESSION_TTL_MS);
      db.prepare(
        `DELETE FROM sessions WHERE user_id = ? AND token_hash NOT IN (
           SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC LIMIT ${MAX_SESSIONS_PER_USER})`,
      ).run(userId, userId);
    });
    return token;
  }

  /** The user behind a session cookie, or null (unknown / expired). Sliding expiry. */
  async sessionUser(token: string): Promise<User | null> {
    if (!token || token.length > 128) return null;
    const hash = hashToken(token);
    const row = (
      await this.q(
        `SELECT s.last_seen_at, s.expires_at, u.${USER_COLS.split(", ").join(", u.")}
         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND u.banned_at IS NULL`,
      )
    ).get(hash) as (UserRow & { last_seen_at: number; expires_at: number }) | undefined;
    if (!row) return null;
    const t = this.now();
    if (row.expires_at <= t) {
      (await this.q("DELETE FROM sessions WHERE token_hash = ?")).run(hash);
      return null;
    }
    if (t - row.last_seen_at > SESSION_REFRESH_MS) {
      (await this.q("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?")).run(
        t,
        t + SESSION_TTL_MS,
        hash,
      );
    }
    return fromRow(row);
  }

  async deleteSession(token: string): Promise<void> {
    (await this.q("DELETE FROM sessions WHERE token_hash = ?")).run(hashToken(token));
  }

  /** Sign this browser out everywhere it had a session (unlinking it). */
  async deleteSessionsForClient(clientHash: string): Promise<void> {
    (await this.q("DELETE FROM sessions WHERE client_hash = ?")).run(clientHash);
  }

  async purgeExpiredSessions(): Promise<number> {
    return Number((await this.q("DELETE FROM sessions WHERE expires_at <= ?")).run(this.now()).changes);
  }

  // ── favorites ────────────────────────────────────────────────────────────
  /** Save / unsave. null if the sticker doesn't exist (or has no sound for kind=sound). */
  async setFavorite(
    userId: string,
    stickerId: string,
    kind: FavoriteKind,
    on: boolean,
  ): Promise<{ saved: boolean; saves: number } | null> {
    if (!isCommunityId(stickerId)) return null;
    const db = await this.db();
    return transaction(db, () => {
      const s = db.prepare("SELECT saves, sound_sec FROM stickers WHERE id = ? AND hidden = 0").get(stickerId) as
        | { saves: number; sound_sec: number | null }
        | undefined;
      if (!s || (kind === "sound" && s.sound_sec === null)) return null;
      const changed = on
        ? db
            .prepare("INSERT OR IGNORE INTO favorites (user_id, sticker_id, kind, created_at) VALUES (?, ?, ?, ?)")
            .run(userId, stickerId, kind, this.now()).changes
        : db
            .prepare("DELETE FROM favorites WHERE user_id = ? AND sticker_id = ? AND kind = ?")
            .run(userId, stickerId, kind).changes;
      if (Number(changed) > 0) {
        db.prepare(`UPDATE stickers SET saves = MAX(0, saves ${on ? "+" : "-"} 1) WHERE id = ?`).run(stickerId);
        if (on) this.trimFavorites(db, userId, kind);
      }
      const saves = (db.prepare("SELECT saves FROM stickers WHERE id = ?").get(stickerId) as { saves: number }).saves;
      return { saved: on, saves };
    });
  }

  /** Keep the newest MAX_FAVORITES per shelf (same cap as the device list). */
  private trimFavorites(db: DatabaseSync, userId: string, kind: FavoriteKind): void {
    const old = db
      .prepare(
        `SELECT sticker_id FROM favorites WHERE user_id = ? AND kind = ? ORDER BY created_at DESC, sticker_id DESC LIMIT -1 OFFSET ${MAX_FAVORITES}`,
      )
      .all(userId, kind) as { sticker_id: string }[];
    for (const { sticker_id } of old) {
      db.prepare("DELETE FROM favorites WHERE user_id = ? AND sticker_id = ? AND kind = ?").run(
        userId,
        sticker_id,
        kind,
      );
      db.prepare("UPDATE stickers SET saves = MAX(0, saves - 1) WHERE id = ?").run(sticker_id);
    }
  }

  async favoriteIds(userId: string): Promise<FavoriteIds> {
    const rows = (
      await this.q("SELECT sticker_id, kind FROM favorites WHERE user_id = ? ORDER BY created_at DESC, sticker_id DESC")
    ).all(userId) as { sticker_id: string; kind: FavoriteKind }[];
    return {
      stickers: rows.filter((r) => r.kind === "sticker").map((r) => r.sticker_id),
      sounds: rows.filter((r) => r.kind === "sound").map((r) => r.sticker_id),
    };
  }

  /**
   * Merge favorites saved on a device before signing in (oldest first so the
   * newest stays on top). Unknown ids are ignored. Returns how many were added.
   */
  async importFavorites(userId: string, items: { id: string; kind: FavoriteKind }[]): Promise<number> {
    const db = await this.db();
    const t0 = this.now();
    return transaction(db, () => {
      let added = 0;
      const find = db.prepare("SELECT sound_sec FROM stickers WHERE id = ? AND hidden = 0");
      const insert = db.prepare(
        "INSERT OR IGNORE INTO favorites (user_id, sticker_id, kind, created_at) VALUES (?, ?, ?, ?)",
      );
      const bump = db.prepare("UPDATE stickers SET saves = saves + 1 WHERE id = ?");
      // Items arrive newest first: give each a slightly older timestamp to keep that order.
      items.slice(0, MAX_FAVORITES * 2).forEach((it, i) => {
        if (!isCommunityId(it.id)) return;
        const s = find.get(it.id) as { sound_sec: number | null } | undefined;
        if (!s || (it.kind === "sound" && s.sound_sec === null)) return;
        if (Number(insert.run(userId, it.id, it.kind, t0 - i).changes) > 0) {
          added++;
          bump.run(it.id);
        }
      });
      this.trimFavorites(db, userId, "sticker");
      this.trimFavorites(db, userId, "sound");
      return added;
    });
  }
}

const isUnique = (err: unknown): boolean => err instanceof Error && /UNIQUE constraint failed/i.test(err.message);
