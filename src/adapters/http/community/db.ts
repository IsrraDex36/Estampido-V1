import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { engagement, popularity } from "./feed.js";

/**
 * Community database: one SQLite file next to the sticker files, through
 * Node's built-in `node:sqlite` (no native module, no extra service).
 *
 * - WAL: readers never block the writer; synchronous=NORMAL is safe with WAL
 *   (a power cut can lose the last commit, never corrupt the file).
 * - Schema versioned with PRAGMA user_version; each step runs once, in a
 *   transaction.
 * - Ranking: `eng` = weighted engagement and `pop` = log10(1 + eng) are kept
 *   per row by triggers that call feed.ts's own functions (registered as SQL
 *   `engagement()` / `popularity()`), so SQL scores are bit-identical to
 *   feed.ts and cursors compare exactly. «hot» = pop - age/36 in plain SQL.
 */
export const MIGRATIONS: readonly string[] = [
  // 1 — stickers
  `CREATE TABLE stickers (
     id           TEXT PRIMARY KEY,
     title        TEXT NOT NULL,
     category     TEXT NOT NULL,
     tags         TEXT NOT NULL DEFAULT '[]',   -- JSON array of lowercase tags
     search       TEXT NOT NULL,                -- normalized title + tags + category label
     created_at   INTEGER NOT NULL,             -- epoch ms
     uses         INTEGER NOT NULL DEFAULT 0 CHECK (uses >= 0),
     pop          REAL NOT NULL DEFAULT 0,      -- log10(1 + uses), kept in sync (fast «hot» ranking)
     sends        INTEGER NOT NULL DEFAULT 0 CHECK (sends >= 0),
     bytes        INTEGER NOT NULL DEFAULT 0 CHECK (bytes >= 0),
     animated     INTEGER NOT NULL CHECK (animated IN (0, 1)),
     sound_sec    REAL,                         -- NULL = silent
     sound_origin TEXT,
     listed       INTEGER NOT NULL DEFAULT 1 CHECK (listed IN (0, 1))
   ) STRICT;
   -- Sticker feed. «new» walks it in order; «hot»/«top» rank from the index
   -- alone (covering: pop and uses included), never touching the table rows.
   CREATE INDEX stickers_listed_new ON stickers (listed, created_at DESC, id DESC, pop, uses);
   -- Sounds tab: only rows with sound (same covering trick).
   CREATE INDEX stickers_sounds_new ON stickers (created_at DESC, id DESC, pop, uses) WHERE sound_sec IS NOT NULL;
   -- «top» + period and category filters.
   CREATE INDEX stickers_created ON stickers (created_at);
   CREATE INDEX stickers_category ON stickers (category, created_at DESC);`,

  // 2 — accounts (login with WhatsApp), sessions, synced favorites, sticker owners
  `CREATE TABLE users (
     id           TEXT PRIMARY KEY,
     account_key  TEXT NOT NULL UNIQUE,         -- HMAC of the WhatsApp number (from the bot)
     handle       TEXT NOT NULL UNIQUE COLLATE NOCASE,
     display_name TEXT NOT NULL,
     bio          TEXT NOT NULL DEFAULT '',
     avatar       TEXT NOT NULL DEFAULT '',     -- "emoji color", e.g. "🐸 lime"
     phone_hint   TEXT NOT NULL DEFAULT '',     -- "…5678", shown only to the owner
     created_at   INTEGER NOT NULL,
     updated_at   INTEGER NOT NULL
   ) STRICT;

   CREATE TABLE sessions (
     token_hash   TEXT PRIMARY KEY,             -- SHA-256 of the cookie token (never the token)
     user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
     client_hash  TEXT NOT NULL DEFAULT '',     -- the browser it was opened from
     created_at   INTEGER NOT NULL,
     last_seen_at INTEGER NOT NULL,
     expires_at   INTEGER NOT NULL
   ) STRICT;
   CREATE INDEX sessions_user ON sessions (user_id);
   CREATE INDEX sessions_expires ON sessions (expires_at);

   -- kind: 'sticker' (saved sticker) or 'sound' (saved sound) — same row, two shelves.
   CREATE TABLE favorites (
     user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
     sticker_id TEXT NOT NULL REFERENCES stickers (id) ON DELETE CASCADE,
     kind       TEXT NOT NULL CHECK (kind IN ('sticker', 'sound')),
     created_at INTEGER NOT NULL,
     PRIMARY KEY (user_id, kind, sticker_id)
   ) STRICT, WITHOUT ROWID;
   CREATE INDEX favorites_user_new ON favorites (user_id, kind, created_at DESC);
   CREATE INDEX favorites_sticker ON favorites (sticker_id);

   ALTER TABLE stickers ADD COLUMN owner_id TEXT REFERENCES users (id) ON DELETE SET NULL;
   ALTER TABLE stickers ADD COLUMN saves INTEGER NOT NULL DEFAULT 0 CHECK (saves >= 0);
   CREATE INDEX stickers_owner_new ON stickers (owner_id, created_at DESC, id DESC) WHERE owner_id IS NOT NULL;`,

  // 3 — trending (combined engagement kept by triggers) + moderation (reports, hiding, bans)
  `ALTER TABLE stickers ADD COLUMN plays INTEGER NOT NULL DEFAULT 0 CHECK (plays >= 0);
   ALTER TABLE stickers ADD COLUMN eng REAL NOT NULL DEFAULT 0;       -- engagement(uses, saves, sends, plays)
   -- 0 visible · 1 hidden by reports (pending review) · 2 hidden by the admin (banned creator)
   ALTER TABLE stickers ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1, 2));
   UPDATE stickers SET eng = engagement(uses, saves, sends, plays);
   UPDATE stickers SET pop = popularity(eng);

   -- Any counter change re-scores the row: no code path can forget it.
   CREATE TRIGGER stickers_score_insert AFTER INSERT ON stickers BEGIN
     UPDATE stickers SET eng = engagement(NEW.uses, NEW.saves, NEW.sends, NEW.plays),
                         pop = popularity(engagement(NEW.uses, NEW.saves, NEW.sends, NEW.plays))
      WHERE id = NEW.id;
   END;
   CREATE TRIGGER stickers_score_update AFTER UPDATE OF uses, saves, sends, plays ON stickers BEGIN
     UPDATE stickers SET eng = engagement(NEW.uses, NEW.saves, NEW.sends, NEW.plays),
                         pop = popularity(engagement(NEW.uses, NEW.saves, NEW.sends, NEW.plays))
      WHERE id = NEW.id;
   END;

   -- Feeds only ever show visible rows: partial covering indexes (pop/eng for hot/top).
   DROP INDEX stickers_listed_new;
   CREATE INDEX stickers_listed_new ON stickers (listed, created_at DESC, id DESC, pop, eng) WHERE hidden = 0;
   DROP INDEX stickers_sounds_new;
   CREATE INDEX stickers_sounds_new ON stickers (created_at DESC, id DESC, pop, eng)
     WHERE sound_sec IS NOT NULL AND hidden = 0;

   -- One play per person per sticker per day (UTC day number).
   CREATE TABLE play_marks (
     sticker_id TEXT NOT NULL REFERENCES stickers (id) ON DELETE CASCADE,
     viewer     TEXT NOT NULL,
     day        INTEGER NOT NULL,
     PRIMARY KEY (sticker_id, viewer, day)
   ) STRICT, WITHOUT ROWID;
   CREATE INDEX play_marks_day ON play_marks (day);

   -- One report per person per sticker.
   CREATE TABLE reports (
     sticker_id TEXT NOT NULL REFERENCES stickers (id) ON DELETE CASCADE,
     reporter   TEXT NOT NULL,                 -- "u:<user id>" or "c:<browser hash>"
     reason     TEXT NOT NULL CHECK (reason IN ('spam', 'ofensivo', 'sexual', 'violencia', 'derechos', 'otro')),
     note       TEXT NOT NULL DEFAULT '',
     created_at INTEGER NOT NULL,
     PRIMARY KEY (sticker_id, reporter)
   ) STRICT, WITHOUT ROWID;
   CREATE INDEX reports_new ON reports (created_at DESC);

   ALTER TABLE users ADD COLUMN banned_at INTEGER;`,

  // 4 — feedback box (ideas, problems, comments for the site owner)
  `CREATE TABLE feedback (
     id         TEXT PRIMARY KEY,
     kind       TEXT NOT NULL CHECK (kind IN ('idea', 'problema', 'otro')),
     message    TEXT NOT NULL,
     contact    TEXT NOT NULL DEFAULT '',
     page       TEXT NOT NULL DEFAULT '',
     app        TEXT NOT NULL DEFAULT '',        -- web version + short user agent, for bug reports
     user_id    TEXT REFERENCES users (id) ON DELETE SET NULL,
     sender     TEXT NOT NULL,                   -- "u:<id>" / "c:<browser hash>" (rate limit)
     status     TEXT NOT NULL DEFAULT 'nuevo' CHECK (status IN ('nuevo', 'leido', 'hecho')),
     created_at INTEGER NOT NULL
   ) STRICT;
   CREATE INDEX feedback_status_new ON feedback (status, created_at DESC);
   CREATE INDEX feedback_sender_new ON feedback (sender, created_at DESC);`,

  // 5 — social: follow creators; packs (curated lists of community stickers)
  `CREATE TABLE follows (
     follower_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
     followee_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
     created_at  INTEGER NOT NULL,
     PRIMARY KEY (follower_id, followee_id),
     CHECK (follower_id != followee_id)
   ) STRICT, WITHOUT ROWID;
   CREATE INDEX follows_followee ON follows (followee_id);

   CREATE TABLE packs (
     id         TEXT PRIMARY KEY,
     owner_id   TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
     name       TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   ) STRICT;
   CREATE INDEX packs_owner ON packs (owner_id, updated_at DESC);

   CREATE TABLE pack_items (
     pack_id    TEXT NOT NULL REFERENCES packs (id) ON DELETE CASCADE,
     sticker_id TEXT NOT NULL REFERENCES stickers (id) ON DELETE CASCADE,
     position   INTEGER NOT NULL,
     added_at   INTEGER NOT NULL,
     PRIMARY KEY (pack_id, sticker_id)
   ) STRICT, WITHOUT ROWID;
   CREATE INDEX pack_items_sticker ON pack_items (sticker_id);`,
  // 6 — owner settings edited from /admin (e.g. handles without a publishing quota)
  `CREATE TABLE settings (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL
   ) STRICT, WITHOUT ROWID;`,
];

export function openCommunityDb(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA temp_store = MEMORY;
  `);
  // The ranking formula lives in feed.ts; SQL calls the very same functions.
  db.function("engagement", { deterministic: true }, (uses, saves, sends, plays) =>
    engagement(Number(uses), Number(saves), Number(sends), Number(plays)),
  );
  db.function("popularity", { deterministic: true }, (eng) => popularity(Number(eng)));
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync): void {
  const { user_version: current } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(MIGRATIONS[v] as string);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

/** Run `fn` in one transaction (all or nothing). */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export const SCHEMA_VERSION = MIGRATIONS.length;
