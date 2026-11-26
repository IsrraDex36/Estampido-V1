import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/adapters/http/app.js";
import { CommunityRepo } from "../../src/adapters/http/community/repo.js";
import {
  ADMIN_WIPE_CONFIRM,
  type AdminCommunity,
  type CommunityPage,
  type CommunitySticker,
} from "../../src/adapters/http/contract.js";
import { ResultStore } from "../../src/adapters/http/resultStore.js";
import { ffmpegPath, run } from "../../src/utils/ffmpeg.js";
import { makeTempDir } from "../helpers/fixtures.js";

/** Owner moderation in /admin: list everything, delete one, wipe all. */
let dir: string;
let results: ResultStore;
let communityDir: string;
let app: ReturnType<typeof createApp>;
const TOKEN = "admin-token-0123456789";
const noBot = {
  status: async () => ({ available: false, connected: false }),
  send: async () => ({ delivered: "sticker" as const }),
};
const asAdmin = (token = TOKEN) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });

async function publish(title: string, soundOnly = false): Promise<CommunitySticker> {
  const job = await results.create();
  const ff = ffmpegPath();
  await run(ff, [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=64x64",
    "-frames:v",
    "1",
    join(job.dir, "sticker.webp"),
  ]);
  await run(ff, [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=f=440:d=1",
    "-c:a",
    "libopus",
    join(job.dir, "sticker.ogg"),
  ]);
  const res = await app.request("/api/community/stickers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      resultId: job.id,
      category: "memes",
      title,
      ownsAudio: true,
      ...(soundOnly ? { share: "sound" } : {}),
    }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as CommunitySticker;
}
const feed = async () =>
  ((await (await app.request("/api/community/stickers")).json()) as CommunityPage<CommunitySticker>).items;
const adminList = async () =>
  (await (await app.request("/api/admin/community", { headers: asAdmin() })).json()) as AdminCommunity;
const stickerDirs = async () => (await readdir(communityDir)).filter((f) => !f.startsWith("community.db"));

beforeAll(async () => {
  dir = await makeTempDir();
  results = new ResultStore(join(dir, "results"));
  communityDir = join(dir, "community");
  app = createApp({ store: results, bot: noBot, community: new CommunityRepo(communityDir), adminToken: TOKEN });
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("admin community moderation", () => {
  it("needs the admin password (401) and is off without SVA_ADMIN_TOKEN (404)", async () => {
    const id = "00000000-0000-0000-0000-000000000000";
    for (const [path, method] of [
      ["/api/admin/community", "GET"],
      ["/api/admin/community", "DELETE"],
      [`/api/admin/community/stickers/${id}`, "DELETE"],
    ] as const) {
      expect((await app.request(path, { method })).status).toBe(401);
      expect((await app.request(path, { method, headers: asAdmin("wrong-token-0123456789") })).status).toBe(401);
    }
    const off = createApp({ store: results, bot: noBot, community: new CommunityRepo(communityDir) });
    expect((await off.request("/api/admin/community", { headers: asAdmin() })).status).toBe(404);
  });

  it("lists every sticker newest first, including «solo el sonido»", async () => {
    await publish("Primero");
    await new Promise((r) => setTimeout(r, 5));
    await publish("Solo sonido", true);
    const list = await adminList();
    expect(list.items.map((s) => s.title)).toEqual(["Solo sonido", "Primero"]);
    expect(list.items[0]).toMatchObject({ listed: false, sends: 0 });
    expect(list.usedBytes).toBeGreaterThan(0);
  });

  it("deletes one: gone from feed, admin list and disk; files 404; second delete 404", async () => {
    const victim = await publish("Borrame");
    expect((await feed()).map((s) => s.id)).toContain(victim.id);
    const res = await app.request(`/api/admin/community/stickers/${victim.id}`, {
      method: "DELETE",
      headers: asAdmin(),
    });
    expect(res.status).toBe(200);
    expect((await feed()).map((s) => s.id)).not.toContain(victim.id);
    expect((await adminList()).items.map((s) => s.id)).not.toContain(victim.id);
    expect(await stickerDirs()).not.toContain(victim.id);
    expect((await app.request(victim.stickerUrl)).status).toBe(404);
    const again = await app.request(`/api/admin/community/stickers/${victim.id}`, {
      method: "DELETE",
      headers: asAdmin(),
    });
    expect(again.status).toBe(404);
    const junk = await app.request("/api/admin/community/stickers/..%2F..%2Fetc", {
      method: "DELETE",
      headers: asAdmin(),
    });
    expect(junk.status).toBe(404);
  });

  it("wipe all needs the exact confirmation; then everything is gone and publishing still works", async () => {
    const before = (await adminList()).items.length;
    expect(before).toBeGreaterThan(0);
    for (const body of [undefined, {}, { confirm: "borrar todo" }, { confirm: "BORRAR" }]) {
      const res = await app.request("/api/admin/community", {
        method: "DELETE",
        headers: asAdmin(),
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      expect(res.status).toBe(400);
    }
    expect((await adminList()).items).toHaveLength(before); // nothing touched

    const res = await app.request("/api/admin/community", {
      method: "DELETE",
      headers: asAdmin(),
      body: JSON.stringify({ confirm: ADMIN_WIPE_CONFIRM }),
    });
    expect(await res.json()).toEqual({ removed: before });
    expect(await feed()).toEqual([]);
    expect(await adminList()).toEqual({ items: [], usedBytes: 0 });
    expect(await stickerDirs()).toEqual([]);

    await publish("Después");
    expect((await feed()).map((s) => s.title)).toEqual(["Después"]);
  });
});

describe("CommunityRepo.remove / clear survive a restart", () => {
  it("the index on disk reflects deletions", async () => {
    const reopened = new CommunityRepo(communityDir);
    expect((await reopened.listAll()).map((s) => s.title)).toEqual(["Después"]);
    expect(await reopened.remove("not-an-id")).toBe(false);
  });
});
