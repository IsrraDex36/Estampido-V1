import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { WASocket } from "baileys";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createControlApp } from "../../src/adapters/bot/control.js";
import { LinkStore } from "../../src/adapters/bot/links.js";
import { clientHash, createApp } from "../../src/adapters/http/app.js";
import { BotRequestError } from "../../src/adapters/http/botClient.js";
import { CommunityRepo } from "../../src/adapters/http/community/repo.js";
import type { CommunitySticker } from "../../src/adapters/http/contract.js";
import { ResultStore } from "../../src/adapters/http/resultStore.js";
import { ffmpegPath, run } from "../../src/utils/ffmpeg.js";
import { makeTempDir } from "../helpers/fixtures.js";

/**
 * API → real bot control check (realpath/allowed folders/file types) → fake
 * socket. Regression: community stickers were rejected by the bot with
 * «Archivo no permitido o inexistente» because only the results folder was allowed.
 */
let dir: string;
const BROWSER = "0f8fad5b-d9cb-469f-a165-70867728950e";
const USER = "5215511112222@s.whatsapp.net";
const TOKEN = "t".repeat(64);

beforeAll(async () => {
  dir = await makeTempDir();
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("community sticker → WhatsApp through the real bot control server", () => {
  it("is delivered (sticker + sound) to the linked chat", async () => {
    const results = new ResultStore(join(dir, "results"));
    const communityDir = join(dir, "community");
    await mkdir(communityDir, { recursive: true });
    const repo = new CommunityRepo(communityDir);

    // Bot side: real control app, linked browser, fake WhatsApp socket.
    const links = new LinkStore(join(dir, "links.json"));
    const hash = clientHash(BROWSER) as string;
    await links.redeem(links.createCode(hash).code, USER, USER);
    const sent: { jid: string }[] = [];
    const sock = {
      user: { id: "525500000001:8@s.whatsapp.net" },
      sendMessage: vi.fn(async (jid: string) => {
        sent.push({ jid });
        return undefined;
      }),
    } as unknown as WASocket;
    const control = createControlApp({ current: () => sock, links: () => links }, TOKEN, [
      join(dir, "results"),
      communityDir,
    ]);
    // API side: the same /send body the HTTP bot client posts.
    const bot = {
      status: async () => ({ available: true, connected: true }),
      send: async (req: unknown) => {
        const res = await control.request("/send", {
          method: "POST",
          headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
          body: JSON.stringify(req),
        });
        const body = (await res.json()) as { delivered?: "native" | "sticker"; error?: string; code?: string };
        if (!res.ok) throw new BotRequestError(body.error ?? "bot", body.code ?? "bot_error", res.status);
        return { delivered: body.delivered ?? "sticker" };
      },
    };
    const app = createApp({ store: results, bot: bot as never, community: repo });

    // A real published sticker with sound.
    const job = await results.create();
    await run(ffmpegPath(), [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=64x64",
      "-frames:v",
      "1",
      join(job.dir, "sticker.webp"),
    ]);
    await run(ffmpegPath(), [
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
    const pub = await app.request("/api/community/stickers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resultId: job.id, category: "memes", ownsAudio: true }),
    });
    const sticker = (await pub.json()) as CommunitySticker;
    // The 30-min result is gone: only the community copy remains.
    await results.remove(job.id);

    const res = await app.request(`/api/community/stickers/${sticker.id}/whatsapp`, {
      method: "POST",
      headers: { "x-estampido-client": BROWSER },
    });
    expect(res.status).toBe(200);
    // The fake socket can't upload media, so the native sound sticker fails and
    // the plan B kicks in: sticker + voice note, both to the linked chat.
    expect(await res.json()).toEqual({ delivered: "separate" });
    expect(sent.map((s) => s.jid)).toEqual([USER, USER]);
  });
});
