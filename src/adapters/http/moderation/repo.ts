import type { DatabaseSync } from "node:sqlite";
import { transaction } from "../community/db.js";
import { type CommunityRepo, isCommunityId, type StoredSticker, VISIBILITY } from "../community/repo.js";
import { REPORT_HIDE_THRESHOLD, type ReportReason } from "../contract.js";

export type ReportOutcome =
  | { status: "reported"; hiddenNow: boolean }
  | { status: "already" }
  | { status: "not_found" }
  | { status: "own" };

export interface QueueEntry {
  sticker: StoredSticker;
  reports: { reason: ReportReason; note: string; createdAt: number }[];
  creatorBanned: boolean;
}

/**
 * Community moderation on the shared database: people report, enough
 * distinct reports hide a sticker until the owner of the site reviews it,
 * and the admin can keep it, delete it or block its creator.
 *
 * Reporter ids are opaque: "u:<user id>" when signed in, else "c:<browser
 * hash>" — one report per person per sticker either way.
 */
export class ModerationRepo {
  constructor(
    private readonly community: CommunityRepo,
    private readonly now: () => number = Date.now,
    private readonly hideThreshold = REPORT_HIDE_THRESHOLD,
  ) {}

  private db(): Promise<DatabaseSync> {
    return this.community.connection();
  }

  async report(stickerId: string, reporter: string, reason: ReportReason, note: string): Promise<ReportOutcome> {
    if (!isCommunityId(stickerId)) return { status: "not_found" };
    const db = await this.db();
    return transaction(db, (): ReportOutcome => {
      const s = db.prepare("SELECT owner_id, hidden FROM stickers WHERE id = ?").get(stickerId) as
        | { owner_id: string | null; hidden: number }
        | undefined;
      // Hidden by the admin = gone for the public; hidden by reports can still be reported.
      if (!s || s.hidden === VISIBILITY.banned) return { status: "not_found" };
      if (s.owner_id && reporter === `u:${s.owner_id}`) return { status: "own" };
      const added = db
        .prepare(
          "INSERT OR IGNORE INTO reports (sticker_id, reporter, reason, note, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(stickerId, reporter, reason, note, this.now()).changes;
      if (Number(added) === 0) return { status: "already" };
      const { n } = db.prepare("SELECT COUNT(*) AS n FROM reports WHERE sticker_id = ?").get(stickerId) as {
        n: number;
      };
      const hide = s.hidden === VISIBILITY.visible && n >= this.hideThreshold;
      if (hide) db.prepare("UPDATE stickers SET hidden = ? WHERE id = ?").run(VISIBILITY.reported, stickerId);
      return { status: "reported", hiddenNow: hide };
    });
  }

  /** Reported stickers, most reported first, then most recent. */
  async queue(): Promise<QueueEntry[]> {
    const db = await this.db();
    const order = db
      .prepare(
        `SELECT sticker_id, COUNT(*) AS n, MAX(created_at) AS latest FROM reports
          GROUP BY sticker_id ORDER BY n DESC, latest DESC LIMIT 200`,
      )
      .all() as { sticker_id: string }[];
    const stickers = new Map(
      (
        await this.community.getMany(
          order.map((o) => o.sticker_id),
          { includeHidden: true },
        )
      ).map((s) => [s.id, s]),
    );
    const reportsOf = db.prepare(
      "SELECT reason, note, created_at FROM reports WHERE sticker_id = ? ORDER BY created_at DESC",
    );
    const bannedOf = db.prepare("SELECT banned_at FROM users WHERE id = ?");
    return order.flatMap(({ sticker_id }) => {
      const sticker = stickers.get(sticker_id);
      if (!sticker) return [];
      const reports = (reportsOf.all(sticker_id) as { reason: ReportReason; note: string; created_at: number }[]).map(
        (r) => ({ reason: r.reason, note: r.note, createdAt: r.created_at }),
      );
      const owner = sticker.ownerId
        ? (bannedOf.get(sticker.ownerId) as { banned_at: number | null } | undefined)
        : undefined;
      return [{ sticker, reports, creatorBanned: owner?.banned_at != null }];
    });
  }

  /** Reports per sticker (for the admin list). */
  async reportCounts(): Promise<Map<string, number>> {
    const db = await this.db();
    const rows = db.prepare("SELECT sticker_id, COUNT(*) AS n FROM reports GROUP BY sticker_id").all() as {
      sticker_id: string;
      n: number;
    }[];
    return new Map(rows.map((r) => [r.sticker_id, r.n]));
  }

  /** «Keep it»: clear its reports and show it again if reports had hidden it. false = no such sticker. */
  async dismiss(stickerId: string): Promise<boolean> {
    if (!isCommunityId(stickerId)) return false;
    const db = await this.db();
    return transaction(db, () => {
      const exists = db.prepare("SELECT 1 AS ok FROM stickers WHERE id = ?").get(stickerId);
      if (!exists) return false;
      db.prepare("DELETE FROM reports WHERE sticker_id = ?").run(stickerId);
      db.prepare("UPDATE stickers SET hidden = ? WHERE id = ? AND hidden = ?").run(
        VISIBILITY.visible,
        stickerId,
        VISIBILITY.reported,
      );
      return true;
    });
  }

  /**
   * Block a creator: signed out everywhere, can't sign in or publish, profile
   * gone and every sticker hidden (kept, so unblocking restores them).
   * Returns how many stickers were hidden.
   */
  async ban(userId: string): Promise<number> {
    const db = await this.db();
    return transaction(db, () => {
      db.prepare("UPDATE users SET banned_at = COALESCE(banned_at, ?) WHERE id = ?").run(this.now(), userId);
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
      return Number(
        db
          .prepare("UPDATE stickers SET hidden = ? WHERE owner_id = ? AND hidden != ?")
          .run(VISIBILITY.banned, userId, VISIBILITY.banned).changes,
      );
    });
  }

  /** Undo a block: the account works again; stickers hidden by the block come back (reported ones stay in review). */
  async unban(userId: string): Promise<number> {
    const db = await this.db();
    return transaction(db, () => {
      db.prepare("UPDATE users SET banned_at = NULL WHERE id = ?").run(userId);
      const restored = Number(
        db
          .prepare("UPDATE stickers SET hidden = ? WHERE owner_id = ? AND hidden = ?")
          .run(VISIBILITY.visible, userId, VISIBILITY.banned).changes,
      );
      // Anything still carrying enough reports goes back to «in review», not straight to the public.
      db.prepare(
        `UPDATE stickers SET hidden = ? WHERE owner_id = ? AND hidden = ?
           AND (SELECT COUNT(*) FROM reports r WHERE r.sticker_id = stickers.id) >= ?`,
      ).run(VISIBILITY.reported, userId, VISIBILITY.visible, this.hideThreshold);
      return restored;
    });
  }
}
