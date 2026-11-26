import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { popularity } from "./feed.js";

/**
 * Community database: one SQLite file next to the sticker files, through
 * Node's built-in `node:sqlite` (no native module, no extra service).
 *
 * - WAL: readers never block the writer; synchronous=NORMAL is safe with WAL
 *   (a power cut can lose the last commit, never corrupt the file).
 * - Schema versioned with PRAGMA user_version; each step runs once, in a
 *   transaction.
 * - «hot» = pop - age/36 in plain SQL arithmetic; `pop` = log10(1 + uses) is
 *   computed by JS (`pop()` registered from feed.ts) when uses change, so SQL
 *   ranks with bit-identical scores to feed.ts (cursors compare exactly).
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
  db.function("pop", { deterministic: true }, (uses) => popularity(Number(uses)));
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
