import { mkdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS } from "../../src/adapters/http/community/db.js";
import { engagement, popularity, TRENDING_WEIGHTS } from "../../src/adapters/http/community/feed.js";
import { CommunityRepo } from "../../src/adapters/http/community/repo.js";
import type { CommunityPage, CommunitySticker } from "../../src/adapters/http/contract.js";
import { type Harness, makeHarness } from "../helpers/apiHarness.js";
import { makeTempDir } from "../helpers/fixtures.js";

/**
 * Trending = weighted engagement (reuses ×3, saves ×2, sends ×1.5, plays ×0.2)
 * kept per row by SQL triggers, with time decay for «hot» and plays counted
 * once per person per day.
 */
const DAY = 86_400_000;
let dir: string;
let h: Harness;
beforeEach(async () => {
  dir = await makeTempDir();
  h = await makeHarness(dir);
});
afterEach(async () => {
  h.close();
  await rm(dir, { recursive: true, force: true });
});

const row = async (id: string) =>
  (await h.community.connection())
    .prepare("SELECT uses, saves, sends, plays, eng, pop FROM stickers WHERE id = ?")
    .get(id) as {
    uses: number;
    saves: number;
    sends: number;
    plays: number;
    eng: number;
    pop: number;
  };
const feed = async (sort: string) =>
  (
    await h.json<CommunityPage<CommunitySticker>>(h.anonymous(`/api/community/stickers?sort=${sort}&period=all`))
  ).items.map((s) => s.title);

describe("engagement score", () => {
  it("weights: a reuse > a save > a send > a play", () => {
    expect(TRENDING_WEIGHTS).toEqual({ uses: 3, saves: 2, sends: 1.5, plays: 0.2 });
    expect(engagement(1, 2, 2, 10)).toBe(3 + 4 + 3 + 2);
    expect(engagement(0)).toBe(0);
  });

  it("every counter change re-scores the row (triggers), through every code path", async () => {
    await h.signIn("ana");
    await h.signIn("beto");
    const s = await h.publish("ana");
    expect(await row(s.id)).toMatchObject({ eng: 0, pop: 0 });
    await h.req("beto", `/api/community/sounds/${s.id}/use`, { method: "POST" }); // use
    await h.req("beto", `/api/me/favorites/sticker/${s.id}`, { method: "PUT" }); // save
    await h.req("beto", `/api/community/stickers/${s.id}/whatsapp`, { method: "POST" }); // send
    await h.req("beto", `/api/community/stickers/${s.id}/play`, { method: "POST" }); // play
    const r = await row(s.id);
    expect(r).toMatchObject({ uses: 1, saves: 1, sends: 1, plays: 1 });
    expect(r.eng).toBe(engagement(1, 1, 1, 1));
    expect(r.pop).toBe(popularity(r.eng)); // bit-identical to the JS formula
    await h.req("beto", `/api/me/favorites/sticker/${s.id}`, { method: "DELETE" }); // unsave lowers it
    expect((await row(s.id)).eng).toBe(engagement(1, 0, 1, 1));
  });

  it("«top» ranks by engagement, not raw uses; «hot» lets a fresh sticker beat an old one", async () => {
    await h.signIn("ana");
    await h.signIn("beto");
    await h.signIn("caro");
    const used = await h.publish("ana", { title: "Usado" }); // 1 reuse = 3
    const loved = await h.publish("ana", { title: "Guardado" }); // 2 saves = 4
    await h.req("beto", `/api/community/sounds/${used.id}/use`, { method: "POST" });
    await h.req("beto", `/api/me/favorites/sticker/${loved.id}`, { method: "PUT" });
    await h.req("caro", `/api/me/favorites/sticker/${loved.id}`, { method: "PUT" });
    expect(await feed("top")).toEqual(["Guardado", "Usado"]);

    h.clock.now += 10 * DAY; // both get old…
    await h.publish("ana", { title: "Nuevo" }); // …and a new one with no engagement yet
    expect((await feed("hot"))[0]).toBe("Nuevo");
    expect(await feed("top")).toEqual(["Guardado", "Usado", "Nuevo"]);
  });
});

describe("plays", () => {
  it("count once per person per day; signed-in and anonymous browsers are different people", async () => {
    await h.signIn("ana");
    const s = await h.publish("ana");
    const play = (b: "beto" | "anon" | "caro") =>
      h.json<{ counted: boolean }>(h.req(b, `/api/community/stickers/${s.id}/play`, { method: "POST" }));
    expect(await play("anon")).toEqual({ counted: true });
    expect(await play("anon")).toEqual({ counted: false }); // replay: no
    expect(await play("beto")).toEqual({ counted: true });
    h.clock.now += DAY;
    expect(await play("anon")).toEqual({ counted: true }); // next day: again
    expect((await row(s.id)).plays).toBe(3);
    // Without any browser id: accepted, never counted.
    expect(await h.json(h.anonymous(`/api/community/stickers/${s.id}/play`, { method: "POST" }))).toEqual({
      counted: false,
    });
    expect(
      (await h.req("beto", "/api/community/stickers/00000000-0000-4000-8000-000000000000/play", { method: "POST" }))
        .status,
    ).toBe(404);
  });

  it("old play marks are purged (only today and yesterday matter)", async () => {
    await h.signIn("ana");
    const s = await h.publish("ana");
    await h.req("beto", `/api/community/stickers/${s.id}/play`, { method: "POST" });
    h.clock.now += 3 * DAY;
    expect(await h.community.purgePlayMarks()).toBe(1);
    expect((await row(s.id)).plays).toBe(1); // the count itself stays
  });
});

describe("upgrade v2 → v3 keeps and re-scores existing stickers", () => {
  it("computes eng/pop for old rows and installs the triggers", async () => {
    const root = join(dir, "old");
    mkdirSync(root, { recursive: true });
    const db = new DatabaseSync(join(root, "community.db"));
    db.exec(MIGRATIONS[0] as string);
    db.function("pop", (u) => Math.log10(1 + Number(u))); // v1/v2 never called functions in DDL; harmless
    db.exec(MIGRATIONS[1] as string);
    db.exec("PRAGMA user_version = 2");
    db.prepare(
      "INSERT INTO stickers (id, title, category, search, created_at, uses, sends, saves, animated, sound_sec) VALUES (?, 'Viejo', 'memes', 'viejo', 1, 2, 4, 1, 1, 2)",
    ).run("00000000-0000-4000-8000-000000000001");
    db.close();

    const repo = new CommunityRepo(root);
    const conn = await repo.connection();
    const r = conn.prepare("SELECT eng, pop, plays, hidden FROM stickers").get() as Record<string, number>;
    expect(r).toEqual({ eng: engagement(2, 1, 4, 0), pop: popularity(engagement(2, 1, 4, 0)), plays: 0, hidden: 0 });
    await repo.recordUse("00000000-0000-4000-8000-000000000001");
    expect(conn.prepare("SELECT eng FROM stickers").get()).toEqual({ eng: engagement(3, 1, 4, 0) });
    expect(conn.prepare("PRAGMA user_version").get()).toEqual({ user_version: MIGRATIONS.length });
    repo.close();
  });
});
