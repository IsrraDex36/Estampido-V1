import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "../../src/adapters/http/community/db.js";
import { type FeedQuery, pageOf } from "../../src/adapters/http/community/feed.js";
import { CommunityFullError, CommunityRepo, type StoredSticker } from "../../src/adapters/http/community/repo.js";
import type { CommunityPeriod, CommunitySort } from "../../src/adapters/http/contract.js";
import { makeTempDir } from "../helpers/fixtures.js";

/**
 * The SQLite community store: SQL ranking/pagination must match the pure
 * reference (feed.ts pageOf) exactly, migrate the old index.json, stay
 * consistent under concurrency and be fast on big tables.
 */
const H = 3_600_000;
const NOW = Date.UTC(2026, 10, 25, 12);
const CATS = ["memes", "musica", "anime", "frases"] as const;
const WORDS = ["gato", "Cumpleaños", "risa", "perro", "100%", "a_b", "épico"];

let dir: string;
let repo: CommunityRepo;
let clock = NOW;
beforeEach(async () => {
  dir = await makeTempDir();
  clock = NOW;
});
afterEach(async () => {
  repo?.close();
  await rm(dir, { recursive: true, force: true });
});

/** Deterministic pseudo-random generator (tests must be reproducible). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function fakeItems(n: number, seed = 1): StoredSticker[] {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const words = WORDS.filter(() => r() < 0.25);
    return {
      id: uuid(Math.floor(r() * 1e9) * 1000 + i), // unrelated to order
      title: words.length ? words.join(" ") : `Sticker ${i}`,
      category: CATS[Math.floor(r() * CATS.length)] as (typeof CATS)[number],
      tags: r() < 0.3 ? ["risa"] : [],
      createdAt: NOW - Math.floor(r() * 30 * 24) * H, // last 30 days, many ties
      uses: Math.floor(r() * 6), // many ties → id tiebreak matters
      saves: Math.floor(r() * 4),
      sends: Math.floor(r() * 3),
      plays: Math.floor(r() * 30),
      hidden: (r() < 0.08 ? 1 : 0) as 0 | 1, // some hidden by reports: never in public feeds
      bytes: 1000,
      animated: r() < 0.5,
      soundSec: r() < 0.7 ? 3 : null,
      soundOrigin: null,
      listed: r() < 0.85,
    };
  });
}

/** Seed through the real legacy-import path (fast, no files needed). */
async function seed(items: StoredSticker[], maxBytes = Number.POSITIVE_INFINITY) {
  await mkdir(join(dir, "c"), { recursive: true });
  await writeFile(join(dir, "c", "index.json"), JSON.stringify(items));
  repo = new CommunityRepo(join(dir, "c"), () => clock, maxBytes);
  await repo.stats(); // opens + imports
}

async function walkSql(q: Omit<FeedQuery, "cursor">, pool: "stickers" | "sounds") {
  const ids: string[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 500; guard++) {
    const p = await repo.page({ ...q, cursor }, pool);
    if ("error" in p) throw new Error("bad cursor");
    ids.push(...p.items.map((i) => i.id));
    if (!p.nextCursor) return ids;
    cursor = p.nextCursor;
  }
  throw new Error("pagination did not end");
}
function walkRef(all: StoredSticker[], q: Omit<FeedQuery, "cursor">, pool: "stickers" | "sounds") {
  const poolItems = all.filter((s) => !s.hidden && (pool === "stickers" ? s.listed !== false : s.soundSec !== null));
  const ids: string[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 500; guard++) {
    const p = pageOf(poolItems, { ...q, cursor }, NOW);
    if ("error" in p) throw new Error("bad cursor");
    ids.push(...p.items.map((i) => i.id));
    if (!p.nextCursor) return ids;
    cursor = p.nextCursor;
  }
  throw new Error("pagination did not end");
}

describe("SQL feed == reference ranking (property test)", () => {
  it("every sort × period × category × search × page size × pool gives the same ids in the same order", async () => {
    const items = fakeItems(400, 7);
    await seed(items);
    const sorts: CommunitySort[] = ["hot", "new", "top"];
    const periods: CommunityPeriod[] = ["day", "week", "all"];
    let combos = 0;
    for (const sort of sorts)
      for (const period of periods)
        for (const category of [undefined, "memes", "frases"] as const)
          for (const q of ["", "gato", "cumpleanos risa", "100%", "a_b", "EPICO", "zzz"])
            for (const limit of [1, 7, 48])
              for (const pool of ["stickers", "sounds"] as const) {
                if (limit === 1 && (q !== "" || category)) continue; // keep it quick
                const query = { sort, period, category, q, limit };
                const sql = await walkSql(query, pool);
                expect(sql, JSON.stringify({ ...query, pool })).toEqual(walkRef(items, query, pool));
                expect(new Set(sql).size).toBe(sql.length); // never repeats
                combos++;
              }
    expect(combos).toBeGreaterThan(500);
  });

  it("search treats % and _ literally and ignores accents/case", async () => {
    await seed([
      { ...fakeItems(1)[0], id: uuid(1), title: "100% real", tags: [], listed: true } as StoredSticker,
      { ...fakeItems(1)[0], id: uuid(2), title: "1000 risas", tags: [], listed: true } as StoredSticker,
      { ...fakeItems(1)[0], id: uuid(3), title: "a_b", tags: [], listed: true } as StoredSticker,
      { ...fakeItems(1)[0], id: uuid(4), title: "axb", tags: [], listed: true } as StoredSticker,
      { ...fakeItems(1)[0], id: uuid(5), title: "Canción ÉPICA", tags: ["Fiesta"], listed: true } as StoredSticker,
    ]);
    const find = async (q: string) => {
      const p = await repo.page({ sort: "new", period: "all", q, limit: 48 }, "stickers");
      return "error" in p ? [] : p.items.map((i) => i.title).sort();
    };
    expect(await find("100%")).toEqual(["100% real"]);
    expect(await find("a_b")).toEqual(["a_b"]);
    expect(await find("cancion epica")).toEqual(["Canción ÉPICA"]);
    expect(await find("fiesta")).toEqual(["Canción ÉPICA"]);
  });

  it("scrolling is stable: stickers published (or used) mid-scroll don't shift later pages", async () => {
    const items = fakeItems(60, 3);
    await seed(items);
    const q = { sort: "new" as const, period: "all" as const, limit: 10 };
    const first = await repo.page({ ...q, cursor: null }, "stickers");
    if ("error" in first || !first.nextCursor) throw new Error("expected more pages");
    clock = NOW + H;
    const file = join(dir, "x.webp");
    await writeFile(file, "RIFF");
    await repo.add({
      title: "Nuevo",
      category: "memes",
      tags: [],
      animated: false,
      soundSec: null,
      soundOrigin: null,
      webpPath: file,
      oggPath: null,
    });
    // Continue the original scroll: the new one never appears.
    const ids = [...first.items.map((i) => i.id)];
    let cursor: string | null = first.nextCursor;
    while (cursor) {
      const p = await repo.page({ ...q, cursor }, "stickers");
      if ("error" in p) throw new Error();
      ids.push(...p.items.map((i) => i.id));
      cursor = p.nextCursor;
    }
    expect(ids).toEqual(walkRef(items, q, "stickers"));
  });

  it("tampered cursor → bad_cursor", async () => {
    await seed(fakeItems(5));
    expect(await repo.page({ sort: "hot", period: "week", limit: 5, cursor: "garbage" }, "stickers")).toEqual({
      error: "bad_cursor",
    });
  });
});

describe("migration from index.json", () => {
  it("imports once, keeps the old file as .migrated, fills defaults, skips junk; survives reopen", async () => {
    const legacy = [
      // an old entry: no listed / sends / bytes fields
      {
        id: uuid(1),
        title: "Viejo",
        category: "memes",
        tags: ["risa"],
        createdAt: NOW,
        uses: 4,
        animated: true,
        soundSec: 2.5,
        soundOrigin: null,
      },
      {
        id: "../etc",
        title: "malo",
        category: "memes",
        tags: [],
        createdAt: NOW,
        uses: 0,
        animated: false,
        soundSec: null,
        soundOrigin: null,
      },
      null,
      {
        id: uuid(2),
        title: "Solo sonido",
        category: "frases",
        tags: [],
        createdAt: NOW - H,
        uses: 1,
        sends: 3,
        bytes: 999,
        animated: false,
        soundSec: 1,
        soundOrigin: null,
        listed: false,
      },
    ];
    await seed(legacy as never);
    expect((await readdir(join(dir, "c"))).sort()).toEqual(
      expect.arrayContaining(["community.db", "index.json.migrated"]),
    );
    expect(await readdir(join(dir, "c"))).not.toContain("index.json");
    const all = await repo.listAll();
    expect(all.map((s) => s.title)).toEqual(["Viejo", "Solo sonido"]);
    expect(all[0]).toMatchObject({
      listed: true,
      sends: 0,
      bytes: 0,
      uses: 4,
      tags: ["risa"],
      animated: true,
      soundSec: 2.5,
    });
    expect(all[1]).toMatchObject({ listed: false, sends: 3, bytes: 999 });
    expect(await repo.stats()).toEqual({ stickers: 1, sounds: 2, uses: 5 });

    repo.close();
    repo = new CommunityRepo(join(dir, "c"));
    expect((await repo.listAll()).length).toBe(2); // not imported twice, persisted
  });

  it("a corrupt index.json is left untouched and the store starts empty", async () => {
    await mkdir(join(dir, "c"), { recursive: true });
    await writeFile(join(dir, "c", "index.json"), "{nope");
    repo = new CommunityRepo(join(dir, "c"));
    expect(await repo.listAll()).toEqual([]);
    expect(await readFile(join(dir, "c", "index.json"), "utf8")).toBe("{nope");
  });
});

describe("database health and consistency", () => {
  it("WAL mode, schema version, integrity ok, feed queries use indexes", async () => {
    await seed(fakeItems(50));
    const db = new DatabaseSync(repo.dbPath);
    try {
      expect(db.prepare("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
      expect(db.prepare("PRAGMA user_version").get()).toEqual({ user_version: SCHEMA_VERSION });
      expect(db.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
      const plan = (sql: string) =>
        (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[]).map((r) => r.detail).join(" | ");
      expect(
        plan(
          "SELECT id FROM stickers WHERE hidden = 0 AND listed = 1 AND created_at <= 0 ORDER BY created_at DESC, id DESC",
        ),
      ).toMatch(/USING (COVERING )?INDEX stickers_listed_new/);
      expect(
        plan("SELECT id FROM stickers WHERE hidden = 0 AND sound_sec IS NOT NULL ORDER BY created_at DESC, id DESC"),
      ).toMatch(/INDEX stickers_sounds_new/);
      expect(plan("SELECT id FROM stickers WHERE id = 'x'")).toMatch(/PRIMARY KEY|sqlite_autoindex/);
    } finally {
      db.close();
    }
  });

  it("counters are atomic under concurrency (50 parallel uses/sends → exactly 50)", async () => {
    await seed([{ ...fakeItems(1)[0], id: uuid(9), soundSec: 2, uses: 0, sends: 0 } as StoredSticker]);
    const uses = await Promise.all(Array.from({ length: 50 }, () => repo.recordUse(uuid(9))));
    await Promise.all(Array.from({ length: 50 }, () => repo.recordSend(uuid(9))));
    expect(new Set(uses).size).toBe(50); // each call saw its own increment
    expect(await repo.get(uuid(9))).toMatchObject({ uses: 50, sends: 50 });
    expect(await repo.recordUse(uuid(404))).toBeNull();
    expect(await repo.recordSend("not-an-id")).toBeNull();
  });

  it("storage cap holds under parallel publishing", async () => {
    await seed([], 10_000);
    const file = join(dir, "s.webp");
    await writeFile(file, Buffer.alloc(3000));
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        repo.add({
          title: `S${i}`,
          category: "memes",
          tags: [],
          animated: false,
          soundSec: null,
          soundOrigin: null,
          webpPath: file,
          oggPath: null,
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3); // 3 × 3000 ≤ 10 000
    expect(
      results
        .filter((r) => r.status === "rejected")
        .every((r) => (r as PromiseRejectedResult).reason instanceof CommunityFullError),
    ).toBe(true);
    expect(await repo.usedBytes()).toBe(9000);
    // Rejected publishes leave no folders behind.
    expect((await readdir(join(dir, "c"))).filter((f) => /^[0-9a-f-]{36}$/.test(f))).toHaveLength(3);
  });

  it("a failed copy leaves no row and no folder", async () => {
    await seed([]);
    await expect(
      repo.add({
        title: "x",
        category: "memes",
        tags: [],
        animated: false,
        soundSec: 1,
        soundOrigin: null,
        webpPath: join(dir, "missing.webp"),
        oggPath: null,
      }),
    ).rejects.toThrow();
    expect(await repo.listAll()).toEqual([]);
  });
});

describe("speed on a big table", () => {
  it("20 000 stickers: any feed page in a few ms", async () => {
    await seed(fakeItems(20_000, 11));
    const queries: Omit<FeedQuery, "cursor">[] = [
      { sort: "new", period: "all", limit: 24 },
      { sort: "hot", period: "week", limit: 24 },
      { sort: "top", period: "week", limit: 24 },
      { sort: "hot", period: "week", limit: 24, q: "gato risa", category: "memes" },
    ];
    for (const q of queries) {
      await repo.page({ ...q, cursor: null }, "stickers"); // warm the prepared statement
      const t = performance.now();
      const runs = 20;
      let cursor: string | null = null;
      for (let i = 0; i < runs; i++) {
        const p = await repo.page({ ...q, cursor }, "stickers");
        if ("error" in p) throw new Error();
        cursor = p.nextCursor;
        if (!cursor) cursor = null;
      }
      const avg = (performance.now() - t) / runs;
      expect(avg, `${q.sort} ${q.q ?? ""}`).toBeLessThan(40);
    }
    // Best of 5 after a warm-up: one sample on a busy CI runner is noise, a
    // real regression (e.g. a full scan per call) is slow every time.
    await repo.stats();
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 5; i++) {
      const t = performance.now();
      await repo.stats();
      best = Math.min(best, performance.now() - t);
    }
    expect(best).toBeLessThan(20);
  });
});
