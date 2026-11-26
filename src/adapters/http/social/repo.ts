import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { transaction } from "../community/db.js";
import { type CommunityRepo, isCommunityId, type StoredSticker } from "../community/repo.js";
import { type CreatorRef, PACK_LIMITS } from "../contract.js";

export class PackError extends Error {
  constructor(
    readonly code: "not_found" | "full" | "too_many_packs" | "hidden",
    message: string,
  ) {
    super(message);
    this.name = "PackError";
  }
}

export interface PackRow {
  id: string;
  name: string;
  ownerId: string;
  owner: CreatorRef;
  count: number;
  coverIds: string[];
  updatedAt: number;
}

/**
 * Social layer on the shared database: following creators, and packs
 * (curated lists of up to 30 visible community stickers, like a WhatsApp
 * pack). Packs only ever show visible stickers; a deleted sticker leaves its
 * packs by cascade.
 */
export class SocialRepo {
  constructor(
    private readonly community: CommunityRepo,
    private readonly now: () => number = Date.now,
  ) {}

  private db(): Promise<DatabaseSync> {
    return this.community.connection();
  }

  // ── follows ──────────────────────────────────────────────────────────────
  /** Follow / unfollow. Returns the followee's follower count. */
  async setFollow(followerId: string, followeeId: string, on: boolean): Promise<number> {
    const db = await this.db();
    if (followerId === followeeId) throw new PackError("not_found", "No puedes seguirte a ti.");
    if (on) {
      db.prepare("INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)").run(
        followerId,
        followeeId,
        this.now(),
      );
    } else {
      db.prepare("DELETE FROM follows WHERE follower_id = ? AND followee_id = ?").run(followerId, followeeId);
    }
    return (db.prepare("SELECT COUNT(*) AS n FROM follows WHERE followee_id = ?").get(followeeId) as { n: number }).n;
  }

  async isFollowing(followerId: string, followeeId: string): Promise<boolean> {
    const db = await this.db();
    return Boolean(
      db.prepare("SELECT 1 AS ok FROM follows WHERE follower_id = ? AND followee_id = ?").get(followerId, followeeId),
    );
  }

  /** Ids of followed (not banned) creators, newest follow first. */
  async followingIds(followerId: string, limit = 500): Promise<string[]> {
    const db = await this.db();
    return (
      db
        .prepare(
          `SELECT f.followee_id AS id FROM follows f JOIN users u ON u.id = f.followee_id
            WHERE f.follower_id = ? AND u.banned_at IS NULL ORDER BY f.created_at DESC LIMIT ?`,
        )
        .all(followerId, limit) as { id: string }[]
    ).map((r) => r.id);
  }

  /** A creator's most used visible stickers (share-preview images). */
  async creatorCoverIds(ownerId: string, limit = 4): Promise<string[]> {
    const db = await this.db();
    return (
      db
        .prepare(
          `SELECT id FROM stickers WHERE owner_id = ? AND hidden = 0 AND listed = 1
            ORDER BY uses DESC, created_at DESC LIMIT ?`,
        )
        .all(ownerId, limit) as { id: string }[]
    ).map((r) => r.id);
  }

  // ── packs ────────────────────────────────────────────────────────────────
  private packRows(db: DatabaseSync, where: string, ...args: (string | number)[]): PackRow[] {
    const rows = db
      .prepare(
        `SELECT p.id, p.name, p.owner_id, p.updated_at, u.handle, u.display_name, u.avatar,
                (SELECT COUNT(*) FROM pack_items i JOIN stickers s ON s.id = i.sticker_id
                  WHERE i.pack_id = p.id AND s.hidden = 0) AS count,
                (SELECT json_group_array(sticker_id) FROM (
                   SELECT i.sticker_id FROM pack_items i JOIN stickers s ON s.id = i.sticker_id
                    WHERE i.pack_id = p.id AND s.hidden = 0 ORDER BY i.position LIMIT 4)) AS covers
           FROM packs p JOIN users u ON u.id = p.owner_id
          WHERE u.banned_at IS NULL AND ${where}
          ORDER BY p.updated_at DESC`,
      )
      .all(...args) as {
      id: string;
      name: string;
      owner_id: string;
      updated_at: number;
      handle: string;
      display_name: string;
      avatar: string;
      count: number;
      covers: string;
    }[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      ownerId: r.owner_id,
      owner: { handle: r.handle, displayName: r.display_name, avatar: r.avatar },
      count: r.count,
      coverIds: JSON.parse(r.covers) as string[],
      updatedAt: r.updated_at,
    }));
  }

  async packsOf(ownerId: string, { onlyNonEmpty = false } = {}): Promise<PackRow[]> {
    const rows = this.packRows(await this.db(), "p.owner_id = ?", ownerId);
    return onlyNonEmpty ? rows.filter((r) => r.count > 0) : rows;
  }

  async pack(id: string): Promise<PackRow | null> {
    if (!isCommunityId(id)) return null;
    return this.packRows(await this.db(), "p.id = ?", id)[0] ?? null;
  }

  /** Is this sticker (still) in the pack? */
  async packContains(packId: string, stickerId: string): Promise<boolean> {
    const db = await this.db();
    return Boolean(
      db.prepare("SELECT 1 AS ok FROM pack_items WHERE pack_id = ? AND sticker_id = ?").get(packId, stickerId),
    );
  }

  /** Visible stickers of a pack, in order. */
  async packStickers(id: string): Promise<StoredSticker[]> {
    const db = await this.db();
    const ids = (
      db
        .prepare(
          `SELECT i.sticker_id AS id FROM pack_items i JOIN stickers s ON s.id = i.sticker_id
            WHERE i.pack_id = ? AND s.hidden = 0 ORDER BY i.position`,
        )
        .all(id) as { id: string }[]
    ).map((r) => r.id);
    return this.community.getMany(ids);
  }

  async createPack(ownerId: string, name: string): Promise<string> {
    const db = await this.db();
    return transaction(db, () => {
      const { n } = db.prepare("SELECT COUNT(*) AS n FROM packs WHERE owner_id = ?").get(ownerId) as { n: number };
      if (n >= PACK_LIMITS.maxPacks) {
        throw new PackError(
          "too_many_packs",
          `Puedes tener hasta ${PACK_LIMITS.maxPacks} packs. Borra uno para crear otro.`,
        );
      }
      const id = randomUUID();
      const t = this.now();
      db.prepare("INSERT INTO packs (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
        id,
        ownerId,
        name,
        t,
        t,
      );
      return id;
    });
  }

  /** Owner-only operations: false when the pack isn't theirs (or doesn't exist). */
  private owns(db: DatabaseSync, packId: string, ownerId: string): boolean {
    return Boolean(db.prepare("SELECT 1 AS ok FROM packs WHERE id = ? AND owner_id = ?").get(packId, ownerId));
  }

  async renamePack(packId: string, ownerId: string, name: string): Promise<boolean> {
    const db = await this.db();
    return (
      Number(
        db
          .prepare("UPDATE packs SET name = ?, updated_at = ? WHERE id = ? AND owner_id = ?")
          .run(name, this.now(), packId, ownerId).changes,
      ) > 0
    );
  }

  async deletePack(packId: string, ownerId: string): Promise<boolean> {
    const db = await this.db();
    return Number(db.prepare("DELETE FROM packs WHERE id = ? AND owner_id = ?").run(packId, ownerId).changes) > 0;
  }

  /** Add a visible sticker at the end (idempotent). Errors: not_found, hidden, full. */
  async addToPack(packId: string, ownerId: string, stickerId: string): Promise<void> {
    if (!isCommunityId(stickerId)) throw new PackError("not_found", "Ese sticker ya no existe.");
    const db = await this.db();
    transaction(db, () => {
      if (!this.owns(db, packId, ownerId)) throw new PackError("not_found", "Ese pack no existe.");
      const s = db.prepare("SELECT hidden FROM stickers WHERE id = ?").get(stickerId) as { hidden: number } | undefined;
      if (!s) throw new PackError("not_found", "Ese sticker ya no existe.");
      if (s.hidden) throw new PackError("hidden", "Ese sticker no está disponible.");
      if (db.prepare("SELECT 1 AS ok FROM pack_items WHERE pack_id = ? AND sticker_id = ?").get(packId, stickerId))
        return;
      const { n, last } = db
        .prepare("SELECT COUNT(*) AS n, COALESCE(MAX(position), -1) AS last FROM pack_items WHERE pack_id = ?")
        .get(packId) as { n: number; last: number };
      if (n >= PACK_LIMITS.maxStickers) {
        throw new PackError("full", `Un pack tiene máximo ${PACK_LIMITS.maxStickers} stickers (como en WhatsApp).`);
      }
      db.prepare("INSERT INTO pack_items (pack_id, sticker_id, position, added_at) VALUES (?, ?, ?, ?)").run(
        packId,
        stickerId,
        last + 1,
        this.now(),
      );
      db.prepare("UPDATE packs SET updated_at = ? WHERE id = ?").run(this.now(), packId);
    });
  }

  async removeFromPack(packId: string, ownerId: string, stickerId: string): Promise<boolean> {
    const db = await this.db();
    return transaction(db, () => {
      if (!this.owns(db, packId, ownerId)) return false;
      const ok =
        Number(
          db.prepare("DELETE FROM pack_items WHERE pack_id = ? AND sticker_id = ?").run(packId, stickerId).changes,
        ) > 0;
      if (ok) db.prepare("UPDATE packs SET updated_at = ? WHERE id = ?").run(this.now(), packId);
      return ok;
    });
  }

  /** Which of my packs already contain this sticker (for the «add to pack» dialog). */
  async packsContaining(ownerId: string, stickerId: string): Promise<string[]> {
    const db = await this.db();
    return (
      db
        .prepare(
          "SELECT p.id FROM packs p JOIN pack_items i ON i.pack_id = p.id WHERE p.owner_id = ? AND i.sticker_id = ?",
        )
        .all(ownerId, stickerId) as { id: string }[]
    ).map((r) => r.id);
  }
}
