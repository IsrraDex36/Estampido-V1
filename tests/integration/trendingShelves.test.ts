import { rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TRENDING_SHELF } from "../../src/adapters/http/community/routes.js";
import type { CommunityStats, CommunityTrending } from "../../src/adapters/http/contract.js";
import { type Harness, makeHarness } from "../helpers/apiHarness.js";
import { makeTempDir } from "../helpers/fixtures.js";

let dir: string;
let h: Harness;
beforeEach(async () => {
  dir = await makeTempDir();
  h = await makeHarness(dir);
  for (const b of ["ana", "beto", "caro"] as const) await h.signIn(b, b);
});
afterEach(async () => {
  h.close();
  await rm(dir, { recursive: true, force: true });
});
const trending = () => h.json<CommunityTrending>(h.req("anon", "/api/community/trending"));

describe("«Tendencias» grouped by category", () => {
  it("empty community: nothing hot, no shelves", async () => {
    expect(await trending()).toEqual({ hot: [], recent: [], shelves: [] });
  });

  it("one shelf per category that has stickers, never empty ones, each holding only its category", async () => {
    await h.publish("ana", { category: "memes", title: "m1" });
    await h.publish("beto", { category: "memes", title: "m2" });
    await h.publish("caro", { category: "musica", title: "u1" });
    const t = await trending();
    expect(t.shelves.map((s) => s.category).sort()).toEqual(["memes", "musica"]);
    for (const s of t.shelves) for (const it of s.items) expect(it.category).toBe(s.category);
    expect(
      t.shelves
        .find((s) => s.category === "memes")
        ?.items.map((i) => i.title)
        .sort(),
    ).toEqual(["m1", "m2"]);
    expect(t.hot).toHaveLength(3);
  });

  it("busiest category first: shelves follow where each category first shows up in the global hot ranking", async () => {
    await h.publish("ana", { category: "animales", title: "old" });
    await h.publish("beto", { category: "gaming", title: "newer" });
    const t = await trending();
    const firstIdx = (cat: string) => t.hot.findIndex((s) => s.category === cat);
    const order = t.shelves.map((s) => s.category);
    expect(order).toEqual([...order].sort((a, b) => firstIdx(a) - firstIdx(b)));
  });

  it("each shelf is a glance (≤ 10), the hot row too", async () => {
    for (let i = 0; i < TRENDING_SHELF + 3; i++)
      await h.publish((["ana", "beto", "caro"] as const)[i % 3], { category: "frases", title: `f${i}` });
    const t = await trending();
    expect(t.hot).toHaveLength(TRENDING_SHELF);
    expect(t.shelves[0]?.items).toHaveLength(TRENDING_SHELF);
  });

  it("a new sticker shows up right away (publishing drops the cache); answers are cacheable 30 s", async () => {
    await h.publish("ana", { category: "memes" });
    const r = await h.req("anon", "/api/community/trending");
    expect(r.headers.get("cache-control")).toBe("public, max-age=30");
    expect(((await r.json()) as CommunityTrending).hot).toHaveLength(1);
    await h.publish("beto", { category: "amor" });
    const t = await trending();
    expect(t.hot).toHaveLength(2);
    expect(t.shelves.map((s) => s.category)).toContain("amor");
  });

  it("«solo el sonido» shares stay out of sticker shelves", async () => {
    await h.publish("ana", { category: "memes", title: "visible" });
    await h.publish("beto", { category: "memes", title: "solo-sonido", share: "sound" });
    const t = await trending();
    expect(t.hot.map((s) => s.title)).toEqual(["visible"]);
    expect(t.shelves.flatMap((s) => s.items).map((s) => s.title)).toEqual(["visible"]);
  });
});

describe("«Recién agregados» and downloads", () => {
  it("the newest stickers come first in «recent»", async () => {
    await h.publish("ana", { title: "viejo" });
    await h.publish("beto", { title: "nuevo" });
    const t = await trending();
    expect(t.recent.map((s) => s.title)).toEqual(["nuevo", "viejo"]);
  });

  it("downloading the file counts as a download — once per person a day, never for anonymous requests", async () => {
    const s = await h.publish("ana", { title: "x" });
    const dl = (b: "ana" | "beto" | "caro") => h.req(b, `${s.stickerUrl}?download`);
    expect((await dl("beto")).status).toBe(200);
    await dl("beto"); // same person, same day: not again
    const count = async () => (await trending()).hot.find((x) => x.id === s.id)?.downloads;
    expect(await count()).toBe(1);
    await dl("caro"); // another person: counts
    expect(await count()).toBe(2);
    await h.anonymous(`${s.stickerUrl}?download`); // no browser id → not counted
    expect(await count()).toBe(2);
    h.clock.now += 86_400_000; // next day, same person: counts again
    await dl("beto");
    expect(await count()).toBe(3);
  });

  it("community stats add up every sticker's downloads (hidden ones left out)", async () => {
    const a = await h.publish("ana", { title: "a" });
    const b = await h.publish("beto", { title: "b" });
    await h.req("caro", `${a.stickerUrl}?download`);
    await h.req("caro", `${b.stickerUrl}?download`);
    await h.req("beto", `${a.stickerUrl}?download`);
    const stats = await h.json<CommunityStats>(h.req("anon", "/api/community/stats"));
    expect(stats).toMatchObject({ stickers: 2, downloads: 3 });
    expect(stats).not.toHaveProperty("uses");
  });

  it("just viewing the image (no ?download) is not a download", async () => {
    const s = await h.publish("ana", { title: "x" });
    await h.req("beto", s.stickerUrl);
    expect((await trending()).hot.find((x) => x.id === s.id)?.downloads).toBe(0);
  });
});
