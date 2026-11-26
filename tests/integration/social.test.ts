import { rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { suggestTags, wordsAsTags } from "../../src/adapters/http/community/tags.js";
import {
  type CommunityPage,
  type CommunitySticker,
  type CreatorProfile,
  PACK_LIMITS,
  type PackDetail,
  type PackSummary,
} from "../../src/adapters/http/contract.js";
import { type Harness, makeHarness } from "../helpers/apiHarness.js";
import { makeTempDir } from "../helpers/fixtures.js";

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
const body = (x: unknown) => ({ body: JSON.stringify(x) });

describe("follow creators", () => {
  it("follow/unfollow (idempotent), counters, followedByMe, not yourself, needs a session", async () => {
    await h.signIn("ana", "ana");
    await h.signIn("beto", "beto");
    await h.signIn("caro", "caro");
    expect((await h.anonymous("/api/creators/ana/follow", { method: "PUT" })).status).toBe(401);
    expect(await h.json(h.req("beto", "/api/creators/ana/follow", { method: "PUT" }))).toEqual({
      following: true,
      followers: 1,
    });
    expect(await h.json(h.req("beto", "/api/creators/ana/follow", { method: "PUT" }))).toEqual({
      following: true,
      followers: 1,
    });
    expect(await h.json(h.req("caro", "/api/creators/ana/follow", { method: "PUT" }))).toEqual({
      following: true,
      followers: 2,
    });
    expect((await h.req("ana", "/api/creators/ana/follow", { method: "PUT" })).status).toBe(400);
    expect((await h.req("ana", "/api/creators/nadie/follow", { method: "PUT" })).status).toBe(404);

    expect(await h.json<CreatorProfile>(h.req("beto", "/api/creators/ana"))).toMatchObject({
      followers: 2,
      followedByMe: true,
    });
    expect(await h.json<CreatorProfile>(h.anonymous("/api/creators/ana"))).not.toHaveProperty("followedByMe");
    expect(await h.json(h.req("beto", "/api/creators/ana/follow", { method: "DELETE" }))).toEqual({
      following: false,
      followers: 1,
    });
    expect(await h.json<CreatorProfile>(h.req("beto", "/api/creators/ana"))).toMatchObject({
      followers: 1,
      followedByMe: false,
    });
    const following = await h.json<{ items: CreatorProfile[] }>(h.req("caro", "/api/me/following"));
    expect(following.items.map((c) => c.handle)).toEqual(["ana"]);
  });

  it("«Siguiendo» feed: only followed creators, newest first; paginated; banned creators drop out", async () => {
    await h.signIn("ana", "ana");
    await h.signIn("beto", "beto");
    await h.signIn("caro", "caro");
    const a1 = await h.publish("ana", { title: "A1" });
    await h.publish("beto", { title: "B1" });
    const a2 = await h.publish("ana", { title: "A2" });
    await h.req("caro", "/api/creators/ana/follow", { method: "PUT" });
    const feed = await h.json<CommunityPage<CommunitySticker>>(h.req("caro", "/api/me/feed"));
    expect(feed.items.map((s) => s.id)).toEqual([a2.id, a1.id]);
    const page1 = await h.json<CommunityPage<CommunitySticker>>(h.req("caro", "/api/me/feed?limit=1"));
    expect(page1.items).toHaveLength(1);
    const page2 = await h.json<CommunityPage<CommunitySticker>>(
      h.req("caro", `/api/me/feed?limit=1&cursor=${page1.nextCursor}`),
    );
    expect(page2.items.map((s) => s.id)).toEqual([a1.id]);
    expect((await h.anonymous("/api/me/feed")).status).toBe(401);
    await h.admin("/api/admin/users/ana/ban", { method: "POST" });
    expect((await h.json<CommunityPage<CommunitySticker>>(h.req("caro", "/api/me/feed"))).items).toEqual([]);
  });

  it("deleting an account removes its follows both ways", async () => {
    await h.signIn("ana", "ana");
    await h.signIn("beto", "beto");
    await h.req("beto", "/api/creators/ana/follow", { method: "PUT" });
    await h.req("beto", "/api/me", { method: "DELETE", ...body({ confirm: "BORRAR MI CUENTA" }) });
    expect((await h.json<CreatorProfile>(h.anonymous("/api/creators/ana"))).followers).toBe(0);
  });
});

describe("packs", () => {
  it("create (with a first sticker), add, keep order, idempotent add, remove, rename, delete", async () => {
    await h.signIn("ana", "ana");
    const s = [
      await h.publish("ana", { title: "Uno" }),
      await h.publish("ana", { title: "Dos" }),
      await h.publish("ana", { title: "Tres" }),
    ];
    const created = await h.req("ana", "/api/me/packs", {
      method: "POST",
      ...body({ name: "  Mis   memes  ", stickerId: s[0]?.id }),
    });
    expect(created.status).toBe(201);
    const pack = await h.json<PackSummary>(created);
    expect(pack).toMatchObject({ name: "Mis memes", count: 1, owner: { handle: "ana" } });
    await h.req("ana", `/api/me/packs/${pack.id}/stickers/${s[2]?.id}`, { method: "PUT" });
    await h.req("ana", `/api/me/packs/${pack.id}/stickers/${s[1]?.id}`, { method: "PUT" });
    const again = await h.json<PackSummary>(
      h.req("ana", `/api/me/packs/${pack.id}/stickers/${s[1]?.id}`, { method: "PUT" }),
    );
    expect(again.count).toBe(3);
    const detail = await h.json<PackDetail>(h.anonymous(`/api/packs/${pack.id}`));
    expect(detail.items.map((x) => x.title)).toEqual(["Uno", "Tres", "Dos"]); // order added
    expect(detail.mine).toBe(false);
    expect((await h.json<PackDetail>(h.req("ana", `/api/packs/${pack.id}`))).mine).toBe(true);
    expect(detail.covers).toHaveLength(3);

    const removed = await h.json<PackSummary>(
      h.req("ana", `/api/me/packs/${pack.id}/stickers/${s[2]?.id}`, { method: "DELETE" }),
    );
    expect(removed.count).toBe(2);
    expect(
      (
        await h.json<PackSummary>(
          h.req("ana", `/api/me/packs/${pack.id}`, { method: "PATCH", ...body({ name: "Top" }) }),
        )
      ).name,
    ).toBe("Top");
    const mine = await h.json<{ items: PackSummary[]; containing: string[] }>(
      h.req("ana", `/api/me/packs?sticker=${s[0]?.id}`),
    );
    expect(mine.containing).toEqual([pack.id]);
    expect((await h.req("ana", `/api/me/packs/${pack.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await h.anonymous(`/api/packs/${pack.id}`)).status).toBe(404);
  });

  it("only the owner edits; validation; limits (30 stickers, 20 packs)", async () => {
    await h.signIn("ana", "ana");
    await h.signIn("beto", "beto");
    const st = await h.publish("ana");
    const pack = await h.json<PackSummary>(
      h.req("ana", "/api/me/packs", { method: "POST", ...body({ name: "Pack" }) }),
    );
    expect((await h.req("beto", `/api/me/packs/${pack.id}/stickers/${st.id}`, { method: "PUT" })).status).toBe(404);
    expect((await h.req("beto", `/api/me/packs/${pack.id}`, { method: "DELETE" })).status).toBe(404);
    for (const bad of [{}, { name: "" }, { name: "x".repeat(41) }, { name: "ok", extra: 1 }]) {
      expect((await h.req("ana", "/api/me/packs", { method: "POST", ...body(bad) })).status, JSON.stringify(bad)).toBe(
        400,
      );
    }
    // 30 stickers max.
    const db = await h.community.connection();
    const ins = db.prepare(
      "INSERT INTO stickers (id, title, category, search, created_at, animated) VALUES (?, 'x', 'memes', 'x', 1, 0)",
    );
    const ids = Array.from(
      { length: PACK_LIMITS.maxStickers },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    for (const id of ids) ins.run(id);
    for (const id of ids.slice(0, PACK_LIMITS.maxStickers - 1)) {
      expect((await h.req("ana", `/api/me/packs/${pack.id}/stickers/${id}`, { method: "PUT" })).status).toBe(200);
    }
    expect((await h.req("ana", `/api/me/packs/${pack.id}/stickers/${st.id}`, { method: "PUT" })).status).toBe(200); // 30th
    const full = await h.req("ana", `/api/me/packs/${pack.id}/stickers/${ids.at(-1)}`, { method: "PUT" });
    expect(full.status).toBe(409);
    expect(await full.json()).toMatchObject({ error: { code: "full" } });
    // 20 packs max.
    for (let i = 1; i < PACK_LIMITS.maxPacks; i++)
      await h.req("ana", "/api/me/packs", { method: "POST", ...body({ name: `P${i}` }) });
    const tooMany = await h.req("ana", "/api/me/packs", { method: "POST", ...body({ name: "Otro" }) });
    expect(tooMany.status).toBe(409);
    expect(await tooMany.json()).toMatchObject({ error: { code: "too_many_packs" } });
  });

  it("hidden or deleted stickers leave packs; packs of banned creators disappear", async () => {
    await h.signIn("ana", "ana");
    const a = await h.publish("ana", { title: "Visible" });
    const b = await h.publish("ana", { title: "Problemático" });
    const pack = await h.json<PackSummary>(
      h.req("ana", "/api/me/packs", { method: "POST", ...body({ name: "Pack", stickerId: a.id }) }),
    );
    await h.req("ana", `/api/me/packs/${pack.id}/stickers/${b.id}`, { method: "PUT" });
    for (const who of ["beto", "caro", "anon"] as const) {
      await h.req(who, `/api/community/stickers/${b.id}/report`, { method: "POST", ...body({ reason: "spam" }) });
    }
    expect((await h.json<PackDetail>(h.anonymous(`/api/packs/${pack.id}`))).items.map((x) => x.title)).toEqual([
      "Visible",
    ]);
    expect((await h.req("ana", `/api/me/packs/${pack.id}/stickers/${b.id}`, { method: "PUT" })).status).toBe(404); // can't add hidden
    await h.req("ana", `/api/me/stickers/${a.id}`, { method: "DELETE" });
    expect((await h.json<PackDetail>(h.anonymous(`/api/packs/${pack.id}`))).count).toBe(0);
    expect((await h.json<{ items: PackSummary[] }>(h.anonymous("/api/creators/ana/packs"))).items).toEqual([]); // empty packs not public
    await h.admin("/api/admin/users/ana/ban", { method: "POST" });
    expect((await h.anonymous(`/api/packs/${pack.id}`)).status).toBe(404);
  });
});

describe("tags", () => {
  it("title words become tags (no stopwords, numbers or junk; accents folded)", () => {
    expect(wordsAsTags("Cuando tu mamá te dice que NO 😂 2024 ¡Épico!")).toEqual(["mama", "dice", "epico"]);
    expect(wordsAsTags("a b xd jajaja")).toEqual([]);
    expect(wordsAsTags("x".repeat(25))).toEqual([]);
  });

  it("suggestions: title first, then category, then overall; unique and capped", () => {
    expect(suggestTags("Perro bailando", ["risa", "perro"], ["memes", "risa", "fiesta"], 5)).toEqual([
      "perro",
      "bailando",
      "risa",
      "memes",
      "fiesta",
    ]);
  });

  it("popular tags from visible stickers, by category and prefix; suggest endpoint", async () => {
    await h.signIn("ana", "ana");
    await h.publish("ana", { title: "A", tags: ["risa", "perro"] });
    await h.publish("ana", { title: "B", tags: ["risa"], category: "musica" });
    await h.publish("ana", { title: "C", tags: ["risa", "remix"], category: "musica" });
    const all = await h.json<{ items: { tag: string; count: number }[] }>(h.anonymous("/api/community/tags"));
    expect(all.items[0]).toEqual({ tag: "risa", count: 3 });
    const music = await h.json<{ items: { tag: string }[] }>(h.anonymous("/api/community/tags?category=musica"));
    expect(music.items.map((t) => t.tag)).toEqual(["risa", "remix"]);
    const pre = await h.json<{ items: { tag: string }[] }>(h.anonymous("/api/community/tags?q=re"));
    expect(pre.items.map((t) => t.tag)).toEqual(["remix"]);
    const weird = await h.anonymous("/api/community/tags?q=%25_%5C");
    expect(weird.status).toBe(200); // wildcards are literal
    const sug = await h.json<{ items: string[] }>(
      h.anonymous("/api/community/tags/suggest?title=Gato%20bailando&category=musica"),
    );
    expect(sug.items.slice(0, 4)).toEqual(["gato", "bailando", "risa", "remix"]);
  });
});
