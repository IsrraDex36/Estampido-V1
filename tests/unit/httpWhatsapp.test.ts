import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { clientHash, createApp, waLink } from "../../src/adapters/http/app.js";
import {
  type BotClient,
  BotRequestError,
  BotUnavailableError,
  createBotClient,
} from "../../src/adapters/http/botClient.js";
import { ResultStore } from "../../src/adapters/http/resultStore.js";
import { writeChunks } from "../../src/core/webp/chunks.js";

let root: string;
const ID = "123e4567-e89b-12d3-a456-426614174000";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "sva-wa-"));
  await mkdir(join(root, ID));
  // Minimal valid animated-flag WebP (VP8X with animation bit).
  const vp8x = Buffer.alloc(10);
  vp8x.writeUInt8(0x02, 0);
  vp8x.writeUIntLE(511, 4, 3);
  vp8x.writeUIntLE(511, 7, 3);
  await writeFile(join(root, ID, "sticker.webp"), writeChunks([{ fourcc: "VP8X", data: vp8x }]));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const fakeBot = (impl: Partial<BotClient> = {}): BotClient => ({
  status: vi.fn(async () => ({ available: true, connected: true, botNumber: "5215500000000" })),
  createLink: vi.fn(async () => ({ code: "EST-AB23", expiresAt: 1 })),
  linkStatus: vi.fn(async () => ({ state: "unlinked" as const })),
  unlink: vi.fn(async () => {}),
  send: vi.fn(async () => ({ delivered: "sticker" as const })),
  ...impl,
});
const CLIENT_ID = "6f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
const H = { "x-estampido-client": CLIENT_ID };

describe("WhatsApp routes", () => {
  it("status proxies the bot", async () => {
    const app = createApp({ store: new ResultStore(root), bot: fakeBot() });
    expect(await (await app.request("/api/whatsapp/status")).json()).toEqual({
      available: true,
      connected: true,
      botNumber: "5215500000000",
    });
  });

  it("sends stored result (no audio → plain sticker request)", async () => {
    const bot = fakeBot();
    const app = createApp({ store: new ResultStore(root), bot });
    const res = await app.request(`/api/results/${ID}/whatsapp`, { method: "POST", headers: H });
    expect(res.status).toBe(200);
    expect(bot.send).toHaveBeenCalledWith({
      client: clientHash(CLIENT_ID),
      webpPath: join(root, ID, "sticker.webp"),
      animated: true,
    });
  });

  it("404 unknown/invalid id, 503 bot offline, 502 send failure", async () => {
    const store = new ResultStore(root);
    expect(
      (await createApp({ store, bot: fakeBot() }).request("/api/results/nope/whatsapp", { method: "POST", headers: H }))
        .status,
    ).toBe(404);
    const offline = fakeBot({ send: async () => Promise.reject(new BotUnavailableError()) });
    const r503 = await createApp({ store, bot: offline }).request(`/api/results/${ID}/whatsapp`, {
      method: "POST",
      headers: H,
    });
    expect(r503.status).toBe(503);
    expect(JSON.stringify(await r503.json())).toMatch(/npm run bot/);
    const broken = fakeBot({ send: async () => Promise.reject(new Error("boom")) });
    expect(
      (await createApp({ store, bot: broken }).request(`/api/results/${ID}/whatsapp`, { method: "POST", headers: H }))
        .status,
    ).toBe(502);
    const notLinked = fakeBot({
      send: async () =>
        Promise.reject(new BotRequestError("Este navegador no tiene un WhatsApp vinculado.", "not_linked", 409)),
    });
    const r409 = await createApp({ store, bot: notLinked }).request(`/api/results/${ID}/whatsapp`, {
      method: "POST",
      headers: H,
    });
    expect(r409.status).toBe(409);
    expect(await r409.json()).toMatchObject({ error: { code: "not_linked" } });
    // No/invalid browser id → 400 (never reaches the bot)
    expect(
      (await createApp({ store, bot: fakeBot() }).request(`/api/results/${ID}/whatsapp`, { method: "POST" })).status,
    ).toBe(400);
  });
});

describe("createBotClient", () => {
  it("reports unavailable when the control file is missing", async () => {
    const client = createBotClient(join(root, "missing.json"));
    expect(await client.status()).toEqual({ available: false, connected: false });
    await expect(client.send({ client: "c", webpPath: "x", animated: false })).rejects.toBeInstanceOf(
      BotUnavailableError,
    );
  });
});

describe("link routes", () => {
  it("hash the browser id (raw id never reaches the bot); pending includes a wa.me link", async () => {
    const bot = fakeBot();
    const app = createApp({ store: new ResultStore(root), bot });
    const created = await (await app.request("/api/whatsapp/link", { method: "POST", headers: H })).json();
    expect(created).toMatchObject({ state: "pending", code: "EST-AB23" });
    expect(created.waLink).toBe(waLink("5215500000000", "EST-AB23"));
    expect(decodeURIComponent(created.waLink)).toContain("EST-AB23");
    expect(bot.createLink).toHaveBeenCalledWith(clientHash(CLIENT_ID));
    expect(JSON.stringify((bot.createLink as ReturnType<typeof vi.fn>).mock.calls)).not.toContain(CLIENT_ID);
    expect(await (await app.request("/api/whatsapp/link", { headers: H })).json()).toEqual({ state: "unlinked" });
    expect(await (await app.request("/api/whatsapp/link", { method: "DELETE", headers: H })).json()).toEqual({
      state: "unlinked",
    });
  });

  it("invalid ids → 400; bot down → 503 JSON", async () => {
    const app = createApp({ store: new ResultStore(root), bot: fakeBot() });
    for (const h of [{}, { "x-estampido-client": "nope" }, { "x-estampido-client": "../../etc" }]) {
      expect((await app.request("/api/whatsapp/link", { headers: h })).status).toBe(400);
    }
    const down = createApp({
      store: new ResultStore(root),
      bot: fakeBot({ createLink: () => Promise.reject(new BotUnavailableError()) }),
    });
    const r = await down.request("/api/whatsapp/link", { method: "POST", headers: H });
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ error: { code: "bot_unavailable" } });
  });

  it("clientHash is stable, salted and validates format", () => {
    expect(clientHash(CLIENT_ID)).toMatch(/^[0-9a-f]{64}$/);
    expect(clientHash(CLIENT_ID.toUpperCase())).toBe(clientHash(CLIENT_ID));
    expect(clientHash("x")).toBeNull();
    expect(clientHash(undefined)).toBeNull();
  });
});

describe("createBotClient vs an older bot", () => {
  it("a 404 from the control server means «restart the bot», reported as unavailable (503)", async () => {
    const { createServer } = await import("node:http");
    const srv = createServer((_req, res) => {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("404 Not Found");
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const port = (srv.address() as { port: number }).port;
    const file = join(root, "control-old.json");
    await writeFile(file, JSON.stringify({ port, token: "t" }));
    const client = createBotClient(file);
    await expect(client.linkStatus("c".repeat(64))).rejects.toThrow(/reiniciarse/);
    await expect(client.linkStatus("c".repeat(64))).rejects.toBeInstanceOf(BotUnavailableError);
    srv.close();
  });
});
