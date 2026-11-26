import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/adapters/http/app.js";
import { CommunityRepo } from "../../src/adapters/http/community/repo.js";
import type { CommunityPage, CommunitySound, CommunitySticker } from "../../src/adapters/http/contract.js";
import { ResultStore } from "../../src/adapters/http/resultStore.js";
import { ffmpegPath, run } from "../../src/utils/ffmpeg.js";
import { makeTempDir } from "../helpers/fixtures.js";

let dir: string;
let results: ResultStore;
let app: ReturnType<typeof createApp>;
const noBot = {
  status: async () => ({ available: false, connected: false }),
  send: async () => ({ delivered: "sticker" as const }),
};

/** A finished result like /api/convert leaves behind (webp + optional ogg). */
async function fakeResult(withSound = true): Promise<string> {
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
  if (withSound) {
    await run(ff, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=f=440:d=2",
      "-c:a",
      "libopus",
      join(job.dir, "sticker.ogg"),
    ]);
  }
  return job.id;
}

const post = (path: string, body: unknown) =>
  app.request(`/api/community${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  dir = await makeTempDir();
  results = new ResultStore(join(dir, "results"));
  app = createApp({ store: results, bot: noBot, community: new CommunityRepo(join(dir, "community")) });
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("community API", () => {
  let soundId = "";

  it("publish: validates category and audio rights, copies files", async () => {
    const id = await fakeResult();
    expect((await post("/stickers", { resultId: id })).status).toBe(400); // no category
    const noRights = await post("/stickers", { resultId: id, category: "memes" });
    expect(noRights.status).toBe(400);
    expect(((await noRights.json()) as { error: { code: string } }).error.code).toBe("audio_rights");

    const ok = await post("/stickers", {
      resultId: id,
      category: "memes",
      title: "Gato ríe",
      tags: ["Risa", "risa"],
      ownsAudio: true,
    });
    expect(ok.status).toBe(201);
    const s = (await ok.json()) as CommunitySticker;
    expect(s).toMatchObject({ title: "Gato ríe", category: "memes", tags: ["risa"], uses: 0, soundOrigin: null });
    expect(s.sound?.durationSec).toBeGreaterThan(1.5);
    soundId = s.id;

    await results.remove(id); // the 30-min result can expire: community copy stays
    const file = await app.request(s.stickerUrl);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/webp");
    expect(file.headers.get("cache-control")).toMatch(/immutable/);
    expect((await app.request(s.sound?.url ?? "")).status).toBe(200);
  });

  it("remix: using a community sound needs no rights checkbox and links the origin", async () => {
    const id = await fakeResult();
    const r = await post("/stickers", { resultId: id, category: "musica", soundOrigin: soundId });
    expect(r.status).toBe(201);
    expect(((await r.json()) as CommunitySticker).soundOrigin).toBe(soundId);
    expect(
      (
        await post("/stickers", {
          resultId: await fakeResult(),
          category: "musica",
          soundOrigin: "00000000-0000-0000-0000-000000000000",
        })
      ).status,
    ).toBe(400);
  });

  it("silent stickers publish without the checkbox and are not sounds", async () => {
    const r = await post("/stickers", { resultId: await fakeResult(false), category: "otros" });
    expect(r.status).toBe(201);
    const s = (await r.json()) as CommunitySticker;
    expect(s.sound).toBeNull();
    expect((await post(`/sounds/${s.id}/use`, {})).status).toBe(404);
  });

  it("sound uses count and drive the sounds ranking", async () => {
    for (let i = 0; i < 3; i++) expect((await post(`/sounds/${soundId}/use`, {})).status).toBe(200);
    const page = (await (
      await app.request("/api/community/sounds?sort=top&period=all")
    ).json()) as CommunityPage<CommunitySound>;
    expect(page.items[0]).toMatchObject({ id: soundId, uses: 3 });
    expect(page.items.every((s) => s.durationSec > 0)).toBe(true);
  });

  it("feed pages through the API with a cursor; bad input → 400", async () => {
    for (let i = 0; i < 5; i++)
      await post("/stickers", { resultId: await fakeResult(false), category: "anime", title: `Anime ${i}` });
    const p1 = (await (
      await app.request("/api/community/stickers?sort=new&limit=3")
    ).json()) as CommunityPage<CommunitySticker>;
    expect(p1.items).toHaveLength(3);
    expect(p1.nextCursor).toBeTruthy();
    const p2 = (await (
      await app.request(`/api/community/stickers?sort=new&limit=3&cursor=${p1.nextCursor}`)
    ).json()) as CommunityPage<CommunitySticker>;
    const ids = [...p1.items, ...p2.items].map((s) => s.id);
    expect(new Set(ids).size).toBe(6);
    const filtered = (await (
      await app.request("/api/community/stickers?category=anime&q=anime%203")
    ).json()) as CommunityPage<CommunitySticker>;
    expect(filtered.items.map((s) => s.title)).toEqual(["Anime 3"]);
    expect((await app.request("/api/community/stickers?cursor=garbage")).status).toBe(400);
    expect((await app.request("/api/community/stickers?sort=nope")).status).toBe(400);
    expect((await app.request("/api/community/files/../index.json")).status).toBe(404);
  });

  it("index survives a restart (persisted atomically)", async () => {
    const fresh = createApp({ store: results, bot: noBot, community: new CommunityRepo(join(dir, "community")) });
    const page = (await (
      await fresh.request("/api/community/stickers?sort=new&limit=48")
    ).json()) as CommunityPage<CommunitySticker>;
    expect(page.items.length).toBe(8);
    await writeFile(join(dir, "community", "index.json"), "{corrupt");
    const broken = createApp({ store: results, bot: noBot, community: new CommunityRepo(join(dir, "community")) });
    expect((await broken.request("/api/community/stickers")).status).toBe(200);
  });
});

describe("community API: lookups", () => {
  it("sound by id + stats", async () => {
    const r = await post("/stickers", { resultId: await fakeResult(), category: "frases", ownsAudio: true });
    const s = (await r.json()) as CommunitySticker;
    const sound = (await (await app.request(`/api/community/sounds/${s.id}`)).json()) as CommunitySound;
    expect(sound).toMatchObject({ id: s.id, category: "frases", uses: 0 });
    expect((await app.request("/api/community/sounds/nope")).status).toBe(404);
    const stats = (await (await app.request("/api/community/stats")).json()) as {
      stickers: number;
      sounds: number;
      uses: number;
    };
    expect(stats.stickers).toBeGreaterThan(0);
    expect(stats.sounds).toBeLessThanOrEqual(stats.stickers);
  });
});

describe("API: junk URLs never break it", () => {
  it.each([
    "/api/nope",
    "/api/community/nope",
    "/api/community/stickers/../../etc/passwd",
    "/api/results/not-a-uuid/sticker.webp",
    "/api/community/files/<script>/sticker.webp",
  ])("%s → JSON error, not a crash", async (path) => {
    const res = await app.request(path);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.headers.get("content-type")).toMatch(/json/);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBeTruthy();
  });

  it.each([
    "?sort=<script>",
    "?limit=-5",
    "?limit=99999",
    "?category=../../x",
    `?q=${"a".repeat(500)}`,
    "?cursor=%E0%A4%A",
    "?period=forever",
  ])("feed query %s → 400 JSON", async (q) => {
    const res = await app.request(`/api/community/stickers${q}`);
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toMatch(/json/);
  });

  it("unknown params are ignored; malformed JSON body → 400", async () => {
    expect((await app.request("/api/community/stickers?utm_source=x&foo=bar")).status).toBe(200);
    const bad = await app.request("/api/community/stickers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{nope",
    });
    expect(bad.status).toBe(400);
  });
});

describe("public server rules", () => {
  const CLIENT_ID = "6f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
  const botWith = (state: "linked" | "unlinked") => ({
    ...noBot,
    linkStatus: async () => (state === "linked" ? { state, phone: "…1", linkedAt: 1 } : { state }),
  });
  const publish = (a: ReturnType<typeof createApp>, resultId: string, headers: Record<string, string> = {}) =>
    a.request("/api/community/stickers", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ resultId, category: "memes", ownsAudio: true }),
    });

  it("publishRequiresLink: no browser id / unlinked → 403 link_required; linked → 201", async () => {
    const repo = new CommunityRepo(join(dir, "guarded"));
    const unlinked = createApp({
      store: results,
      bot: botWith("unlinked") as never,
      community: repo,
      publishRequiresLink: true,
    });
    const r1 = await publish(unlinked, await fakeResult());
    expect(r1.status).toBe(403);
    expect(await r1.json()).toMatchObject({ error: { code: "link_required" } });
    expect((await publish(unlinked, await fakeResult(), { "x-estampido-client": CLIENT_ID })).status).toBe(403);
    const linked = createApp({
      store: results,
      bot: botWith("linked") as never,
      community: repo,
      publishRequiresLink: true,
    });
    expect((await publish(linked, await fakeResult(), { "x-estampido-client": CLIENT_ID })).status).toBe(201);
  });

  it("storage cap → 507 storage_full, nothing half-written", async () => {
    const repo = new CommunityRepo(join(dir, "tiny"), Date.now, 10); // 10 bytes
    const app = createApp({ store: results, bot: noBot, community: repo });
    const r = await publish(app, await fakeResult());
    expect(r.status).toBe(507);
    expect(await r.json()).toMatchObject({ error: { code: "storage_full" } });
    expect(await repo.list()).toHaveLength(0);
  });
});

describe("community → WhatsApp", () => {
  it("sends the community files (with sound) to the linked chat, counts the send; needs a browser id", async () => {
    const sends: { client: string; webpPath: string; audioPath?: string; audioDurationSec?: number }[] = [];
    const repo = new CommunityRepo(join(dir, "community-send"));
    const bot = {
      status: async () => ({ available: true, connected: true }),
      send: async (req: { client: string; webpPath: string; audioPath?: string; audioDurationSec?: number }) => {
        sends.push(req);
        return { delivered: "native" as const };
      },
    };
    const a = createApp({ store: results, bot: bot as never, community: repo });
    const id = await fakeResult(true);
    const pub = await a.request("/api/community/stickers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resultId: id, category: "memes", title: "Para enviar", ownsAudio: true }),
    });
    expect(pub.status).toBe(201);
    const sticker = (await pub.json()) as CommunitySticker;

    const url = `/api/community/stickers/${sticker.id}/whatsapp`;
    expect((await a.request(url, { method: "POST" })).status).toBe(400); // no browser id
    const ok = await a.request(url, {
      method: "POST",
      headers: { "x-estampido-client": "0f8fad5b-d9cb-469f-a165-70867728950e" },
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ delivered: "native" });
    expect(sends).toHaveLength(1);
    expect(sends[0]?.webpPath).toContain(join("community-send", sticker.id, "sticker.webp"));
    expect(sends[0]?.audioPath).toContain(join("community-send", sticker.id, "sticker.ogg"));
    expect(sends[0]?.audioDurationSec).toBeGreaterThan(1.5);
    expect((await repo.get(sticker.id))?.sends).toBe(1);

    const missing = await a.request("/api/community/stickers/00000000-0000-0000-0000-000000000000/whatsapp", {
      method: "POST",
      headers: { "x-estampido-client": "0f8fad5b-d9cb-469f-a165-70867728950e" },
    });
    expect(missing.status).toBe(404);
    expect(sends).toHaveLength(1);
  });

  it("a silent community sticker is sent without audio; a bot failure doesn't count as a send", async () => {
    const repo = new CommunityRepo(join(dir, "community-send-2"));
    let fail = false;
    const sends: { audioPath?: string }[] = [];
    const bot = {
      status: async () => ({ available: true, connected: true }),
      send: async (req: { audioPath?: string }) => {
        if (fail) throw new Error("boom");
        sends.push(req);
        return { delivered: "sticker" as const };
      },
    };
    const a = createApp({ store: results, bot: bot as never, community: repo });
    const id = await fakeResult(false);
    const pub = await a.request("/api/community/stickers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resultId: id, category: "memes" }),
    });
    const sticker = (await pub.json()) as CommunitySticker;
    const h = { "x-estampido-client": "0f8fad5b-d9cb-469f-a165-70867728950e" };
    expect(
      (await a.request(`/api/community/stickers/${sticker.id}/whatsapp`, { method: "POST", headers: h })).status,
    ).toBe(200);
    expect(sends[0]?.audioPath).toBeUndefined();
    fail = true;
    expect((await a.request(`/api/community/stickers/${sticker.id}/whatsapp`, { method: "POST", headers: h })).ok).toBe(
      false,
    );
    expect((await repo.get(sticker.id))?.sends).toBe(1);
  });
});

describe("publish: what to share", () => {
  const pub = (a: ReturnType<typeof createApp>, body: unknown) =>
    a.request("/api/community/stickers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("«solo el sticker»: silent copy, no rights needed, no sound kept", async () => {
    const repo = new CommunityRepo(join(dir, "share-sticker"));
    const a = createApp({ store: results, bot: noBot, community: repo });
    const res = await pub(a, { resultId: await fakeResult(true), share: "sticker", category: "memes" });
    expect(res.status).toBe(201);
    const s = (await res.json()) as CommunitySticker;
    expect(s.sound).toBeNull();
    expect(s.listed).toBe(true);
    expect(await repo.resolveFile(s.id, "sticker.ogg")).toBeNull();
    const sounds = (await (await a.request("/api/community/sounds")).json()) as CommunityPage<CommunitySound>;
    expect(sounds.items.map((x) => x.id)).not.toContain(s.id);
  });

  it("«solo el sonido»: needs rights, appears under Sonidos but not in the sticker feed", async () => {
    const repo = new CommunityRepo(join(dir, "share-sound"));
    const a = createApp({ store: results, bot: noBot, community: repo });
    const id = await fakeResult(true);
    expect((await pub(a, { resultId: id, share: "sound", category: "memes" })).status).toBe(400); // rights
    const res = await pub(a, { resultId: id, share: "sound", category: "memes", ownsAudio: true });
    expect(res.status).toBe(201);
    const s = (await res.json()) as CommunitySticker;
    expect(s.listed).toBe(false);
    expect(s.title).toMatch(/^Sonido de /);
    const feed = (await (await a.request("/api/community/stickers")).json()) as CommunityPage<CommunitySticker>;
    expect(feed.items.map((x) => x.id)).not.toContain(s.id);
    const sounds = (await (await a.request("/api/community/sounds")).json()) as CommunityPage<CommunitySound>;
    expect(sounds.items.map((x) => x.id)).toContain(s.id);
    const stats = (await (await a.request("/api/community/stats")).json()) as { stickers: number; sounds: number };
    expect(stats).toMatchObject({ stickers: 0, sounds: 1 });
  });

  it("rejects «solo el sonido» without sound or for a community sound (duplicate)", async () => {
    const repo = new CommunityRepo(join(dir, "share-rules"));
    const a = createApp({ store: results, bot: noBot, community: repo });
    const silentRes = await pub(a, { resultId: await fakeResult(false), share: "sound", category: "memes" });
    expect(silentRes.status).toBe(400);
    expect(((await silentRes.json()) as { error: { code: string } }).error.code).toBe("no_sound");

    const original = (await (
      await pub(a, { resultId: await fakeResult(true), category: "memes", ownsAudio: true })
    ).json()) as CommunitySticker;
    const dup = await pub(a, {
      resultId: await fakeResult(true),
      share: "sound",
      category: "memes",
      soundOrigin: original.id,
    });
    expect(((await dup.json()) as { error: { code: string } }).error.code).toBe("duplicate_sound");
    // A silent copy of a remix drops the sound and its origin link.
    const silentRemix = await pub(a, {
      resultId: await fakeResult(true),
      share: "sticker",
      category: "memes",
      soundOrigin: original.id,
    });
    expect(((await silentRemix.json()) as CommunitySticker).soundOrigin).toBeNull();
  });
});
