import { rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  AdminCommunity,
  AdminReports,
  CommunityPage,
  CommunitySound,
  CommunityStats,
  CommunitySticker,
  CreatorProfile,
} from "../../src/adapters/http/contract.js";
import { REPORT_HIDE_THRESHOLD } from "../../src/adapters/http/contract.js";
import { type Browser, type Harness, makeHarness } from "../helpers/apiHarness.js";
import { makeTempDir } from "../helpers/fixtures.js";

/**
 * Moderation end to end: people report, 3 distinct reports hide a sticker
 * everywhere public (feeds, sounds, files, profile, stats, favorites,
 * WhatsApp) while its owner and the admin can still see it; the admin keeps,
 * deletes or blocks the creator (and can undo the block).
 */
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

const report = (b: Browser, id: string, body: unknown = { reason: "spam" }) =>
  h.req(b, `/api/community/stickers/${id}/report`, { method: "POST", body: JSON.stringify(body) });
const feedIds = async () =>
  (await h.json<CommunityPage<CommunitySticker>>(h.anonymous("/api/community/stickers?sort=new"))).items.map(
    (s) => s.id,
  );
const soundIds = async () =>
  (await h.json<CommunityPage<CommunitySound>>(h.anonymous("/api/community/sounds?sort=new"))).items.map((s) => s.id);

/** Ana publishes; three other people report it → hidden. */
async function hiddenByReports() {
  await h.signIn("ana", "ana");
  const s = await h.publish("ana", { title: "Problemático" });
  for (const b of ["beto", "caro", "anon"] as const) expect((await report(b, s.id)).status).toBe(200);
  return s;
}

describe("reporting", () => {
  it("validates the request; can't report your own; one report per person", async () => {
    await h.signIn("ana");
    const s = await h.publish("ana");
    for (const bad of [
      {},
      { reason: "aburrido" },
      { reason: "spam", note: "x".repeat(201) },
      { reason: "spam", extra: 1 },
      "nope",
    ]) {
      expect((await report("beto", s.id, bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect(
      (await h.anonymous(`/api/community/stickers/${s.id}/report`, { method: "POST", body: '{"reason":"spam"}' }))
        .status,
    ).toBe(400);
    expect((await report("beto", "00000000-0000-4000-8000-000000000000")).status).toBe(404);
    const own = await report("ana", s.id);
    expect(own.status).toBe(400);
    expect(await own.json()).toMatchObject({ error: { code: "own_sticker" } });
    expect(await h.json(report("beto", s.id, { reason: "derechos", note: "  Es de mi canal\u0007 " }))).toEqual({
      reported: true,
    });
    expect(await h.json(report("beto", s.id, { reason: "spam" }))).toEqual({ reported: false }); // already
    const q = await h.json<AdminReports>(h.admin("/api/admin/reports"));
    expect(q.items[0]?.notes).toEqual([{ reason: "derechos", note: "Es de mi canal", createdAt: expect.any(String) }]);
  });

  it(`${REPORT_HIDE_THRESHOLD} distinct people hide it from everything public`, async () => {
    await h.signIn("beto");
    await h.signIn("caro");
    const s = await hiddenByReports();
    await h.req("beto", `/api/me/favorites/sticker/${s.id}`, { method: "PUT" }).catch(() => {});
    expect(await feedIds()).not.toContain(s.id);
    expect(await soundIds()).not.toContain(s.id);
    expect((await h.anonymous(`/api/community/sounds/${s.id}`)).status).toBe(404);
    expect((await h.anonymous(s.stickerUrl)).status).toBe(404);
    expect((await h.req("beto", `/api/community/stickers/${s.id}/whatsapp`, { method: "POST" })).status).toBe(404);
    expect((await h.req("beto", `/api/community/sounds/${s.id}/use`, { method: "POST" })).status).toBe(404);
    expect((await h.req("beto", `/api/me/favorites/sticker/${s.id}`, { method: "PUT" })).status).toBe(404);
    const page = await h.json<CommunityPage<CommunitySticker>>(h.anonymous("/api/creators/ana/stickers"));
    expect(page.items).toEqual([]);
    expect((await h.json<CreatorProfile>(h.anonymous("/api/creators/ana"))).stats.stickers).toBe(0);
    expect(await h.json<CommunityStats>(h.anonymous("/api/community/stats"))).toEqual({
      stickers: 0,
      sounds: 0,
      downloads: 0,
    });
  });

  it("the owner still sees it (marked hidden) and can open its files; the admin too", async () => {
    const s = await hiddenByReports();
    const mine = await h.json<CommunityPage<CommunitySticker>>(h.req("ana", "/api/me/stickers"));
    expect(mine.items).toMatchObject([{ id: s.id, hidden: true }]);
    const own = await h.req("ana", s.stickerUrl);
    expect(own.status).toBe(200);
    expect(own.headers.get("cache-control")).toBe("private, no-store");
    expect((await h.admin(s.stickerUrl)).status).toBe(200);
    expect((await h.req("beto", s.stickerUrl)).status).toBe(404);
    const me = await h.json<{ stats: { stickers: number } }>(h.req("ana", "/api/me"));
    expect(me.stats.stickers).toBe(1); // my own numbers count it
  });

  it("a hidden sound can't be reused as the origin of a new sticker", async () => {
    const s = await hiddenByReports();
    await h.signIn("beto");
    const r = await h.req("beto", "/api/community/stickers", {
      method: "POST",
      body: JSON.stringify({ resultId: await h.makeResult(), category: "memes", soundOrigin: s.id }),
    });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ error: { message: "El sonido de la comunidad ya no existe." } });
  });
});

describe("admin review queue", () => {
  it("needs the admin password", async () => {
    for (const [path, method] of [
      ["/api/admin/reports", "GET"],
      ["/api/admin/reports/00000000-0000-4000-8000-000000000000/dismiss", "POST"],
      ["/api/admin/users/ana/ban", "POST"],
      ["/api/admin/users/ana/ban", "DELETE"],
    ] as const) {
      expect((await h.anonymous(path, { method })).status, `${method} ${path}`).toBe(401);
    }
  });

  it("lists reported stickers most-reported first, with reasons per person and notes", async () => {
    await h.signIn("ana", "ana");
    const a = await h.publish("ana", { title: "A" });
    const b = await h.publish("ana", { title: "B" });
    await report("beto", b.id, { reason: "ofensivo", note: "insulta" });
    await report("caro", a.id, { reason: "spam" });
    await report("anon", a.id, { reason: "sexual" });
    const q = await h.json<AdminReports>(h.admin("/api/admin/reports"));
    expect(q.items.map((i) => [i.sticker.title, i.sticker.reports])).toEqual([
      ["A", 2],
      ["B", 1],
    ]);
    expect(q.items[0]?.reasons).toEqual({ spam: 1, sexual: 1 });
    expect(q.items[0]?.sticker.creator?.handle).toBe("ana");
    expect(q.items[1]?.notes[0]?.note).toBe("insulta");
    const list = await h.json<AdminCommunity>(h.admin("/api/admin/community"));
    expect(list.items.find((s) => s.id === a.id)).toMatchObject({ reports: 2, hidden: false, plays: 0 });
  });

  it("«keep it» clears the reports and shows it again", async () => {
    const s = await hiddenByReports();
    expect((await h.admin(`/api/admin/reports/${s.id}/dismiss`, { method: "POST" })).status).toBe(200);
    expect(await feedIds()).toContain(s.id);
    expect((await h.json<AdminReports>(h.admin("/api/admin/reports"))).items).toEqual([]);
    expect(
      (await h.admin("/api/admin/reports/00000000-0000-4000-8000-000000000000/dismiss", { method: "POST" })).status,
    ).toBe(404);
  });

  it("deleting a reported sticker removes it and its reports", async () => {
    const s = await hiddenByReports();
    expect((await h.admin(`/api/admin/community/stickers/${s.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await h.json<AdminReports>(h.admin("/api/admin/reports"))).items).toEqual([]);
  });
});

describe("blocking a creator", () => {
  it("signs them out, blocks sign-in and publishing, hides profile and stickers; unblocking restores", async () => {
    await h.signIn("ana", "ana");
    const s1 = await h.publish("ana", { title: "Uno" });
    const s2 = await h.publish("ana", { title: "Dos" });
    expect((await h.admin("/api/admin/users/ana/ban", { method: "POST" })).status).toBe(200);

    expect((await h.req("ana", "/api/me")).status).toBe(401); // session killed
    const again = await h.anonymous("/api/auth/session", {
      method: "POST",
      headers: { "x-estampido-client": "11111111-1111-4111-8111-111111111111" },
    });
    expect(again.status).toBe(403);
    expect(await again.json()).toMatchObject({ error: { code: "account_banned" } });
    expect((await h.anonymous("/api/creators/ana")).status).toBe(404);
    expect(await feedIds()).toEqual([]);
    expect((await h.json<{ items: CreatorProfile[] }>(h.anonymous("/api/creators"))).items).toEqual([]);
    expect((await report("beto", s1.id)).status).toBe(404); // hidden by the admin: gone for the public

    const un = await h.json<{ restored: number }>(h.admin("/api/admin/users/ana/ban", { method: "DELETE" }));
    expect(un.restored).toBe(2);
    expect((await feedIds()).sort()).toEqual([s1.id, s2.id].sort());
    expect((await h.anonymous("/api/creators/ana")).status).toBe(200);
    await h.signIn("ana"); // can sign in again
    expect((await h.admin("/api/admin/users/nadie/ban", { method: "POST" })).status).toBe(404);
  });

  it("unblocking doesn't publish stickers that were already under review", async () => {
    const s = await hiddenByReports();
    await h.admin("/api/admin/users/ana/ban", { method: "POST" });
    await h.admin("/api/admin/users/ana/ban", { method: "DELETE" });
    expect(await feedIds()).not.toContain(s.id);
    expect((await h.json<AdminReports>(h.admin("/api/admin/reports"))).items[0]?.sticker).toMatchObject({
      id: s.id,
      hidden: true,
    });
  });

  it("the queue tells the admin when a creator is already blocked", async () => {
    const s = await hiddenByReports();
    await h.admin("/api/admin/users/ana/ban", { method: "POST" });
    const q = await h.json<AdminReports>(h.admin("/api/admin/reports"));
    expect(q.items.find((i) => i.sticker.id === s.id)?.creatorBanned).toBe(true);
  });
});
