import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { CommunityRepo } from "../community/repo.js";
import { FEEDBACK_LIMITS, type FeedbackItem, type FeedbackKind, type FeedbackStatus } from "../contract.js";

export interface NewFeedback {
  kind: FeedbackKind;
  message: string;
  contact: string;
  page: string;
  app: string;
  userId: string | null;
  /** "u:<id>" / "c:<hash>": who, for the per-person hourly limit. */
  sender: string;
}

/** Too many messages from the same person in the last hour. */
export class FeedbackLimitError extends Error {
  constructor() {
    super("Gracias, ya nos mandaste varios mensajes. Inténtalo de nuevo en un rato.");
    this.name = "FeedbackLimitError";
  }
}

interface Row {
  id: string;
  kind: FeedbackKind;
  message: string;
  contact: string;
  page: string;
  app: string;
  status: FeedbackStatus;
  created_at: number;
  handle: string | null;
  display_name: string | null;
  avatar: string | null;
}

const HOUR = 3_600_000;

/** Feedback box: messages for the site owner, on the shared database. */
export class FeedbackRepo {
  constructor(
    private readonly community: CommunityRepo,
    private readonly now: () => number = Date.now,
  ) {}

  private db(): Promise<DatabaseSync> {
    return this.community.connection();
  }

  async add(input: NewFeedback): Promise<string> {
    const db = await this.db();
    const t = this.now();
    const { n } = db
      .prepare("SELECT COUNT(*) AS n FROM feedback WHERE sender = ? AND created_at > ?")
      .get(input.sender, t - HOUR) as { n: number };
    if (n >= FEEDBACK_LIMITS.perHour) throw new FeedbackLimitError();
    const id = randomUUID();
    db.prepare(
      "INSERT INTO feedback (id, kind, message, contact, page, app, user_id, sender, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, input.kind, input.message, input.contact, input.page, input.app, input.userId, input.sender, t);
    return id;
  }

  /** Newest first; `status` filters (default: everything). */
  async list(status?: FeedbackStatus, limit = 200): Promise<{ items: FeedbackItem[]; unread: number }> {
    const db = await this.db();
    const rows = db
      .prepare(
        `SELECT f.id, f.kind, f.message, f.contact, f.page, f.app, f.status, f.created_at,
                u.handle, u.display_name, u.avatar
           FROM feedback f LEFT JOIN users u ON u.id = f.user_id
          ${status ? "WHERE f.status = ?" : ""}
          ORDER BY f.created_at DESC LIMIT ${Math.min(500, Math.max(1, limit))}`,
      )
      .all(...(status ? [status] : [])) as unknown as Row[];
    const { unread } = db.prepare("SELECT COUNT(*) AS unread FROM feedback WHERE status = 'nuevo'").get() as {
      unread: number;
    };
    return {
      unread,
      items: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        message: r.message,
        contact: r.contact,
        page: r.page,
        app: r.app,
        status: r.status,
        createdAt: new Date(r.created_at).toISOString(),
        author: r.handle ? { handle: r.handle, displayName: r.display_name ?? r.handle, avatar: r.avatar ?? "" } : null,
      })),
    };
  }

  async setStatus(id: string, status: FeedbackStatus): Promise<boolean> {
    const db = await this.db();
    return Number(db.prepare("UPDATE feedback SET status = ? WHERE id = ?").run(status, id).changes) > 0;
  }

  async remove(id: string): Promise<boolean> {
    const db = await this.db();
    return Number(db.prepare("DELETE FROM feedback WHERE id = ?").run(id).changes) > 0;
  }
}
