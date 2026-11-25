import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/adapters/http/app.js";
import { type BotClient, BotUnavailableError, createBotClient } from "../../src/adapters/http/botClient.js";
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
  status: vi.fn(async () => ({ available: true, connected: true })),
  sendToSelf: vi.fn(async () => ({ delivered: "sticker" as const })),
  ...impl,
});

describe("WhatsApp routes", () => {
  it("status proxies the bot", async () => {
    const app = createApp({ store: new ResultStore(root), bot: fakeBot() });
    expect(await (await app.request("/api/whatsapp/status")).json()).toEqual({ available: true, connected: true });
  });

  it("sends stored result (no audio → plain sticker request)", async () => {
    const bot = fakeBot();
    const app = createApp({ store: new ResultStore(root), bot });
    const res = await app.request(`/api/results/${ID}/whatsapp`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(bot.sendToSelf).toHaveBeenCalledWith({ webpPath: join(root, ID, "sticker.webp"), animated: true });
  });

  it("404 unknown/invalid id, 503 bot offline, 502 send failure", async () => {
    const store = new ResultStore(root);
    expect(
      (await createApp({ store, bot: fakeBot() }).request("/api/results/nope/whatsapp", { method: "POST" })).status,
    ).toBe(404);
    const offline = fakeBot({ sendToSelf: async () => Promise.reject(new BotUnavailableError()) });
    const r503 = await createApp({ store, bot: offline }).request(`/api/results/${ID}/whatsapp`, { method: "POST" });
    expect(r503.status).toBe(503);
    expect(JSON.stringify(await r503.json())).toMatch(/npm run bot/);
    const broken = fakeBot({ sendToSelf: async () => Promise.reject(new Error("boom")) });
    expect(
      (await createApp({ store, bot: broken }).request(`/api/results/${ID}/whatsapp`, { method: "POST" })).status,
    ).toBe(502);
  });
});

describe("createBotClient", () => {
  it("reports unavailable when the control file is missing", async () => {
    const client = createBotClient(join(root, "missing.json"));
    expect(await client.status()).toEqual({ available: false, connected: false });
    await expect(client.sendToSelf({ webpPath: "x", animated: false })).rejects.toBeInstanceOf(BotUnavailableError);
  });
});
