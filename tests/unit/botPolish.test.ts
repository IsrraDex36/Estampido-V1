import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WAMessage, WASocket } from "baileys";
import { describe, expect, it, vi } from "vitest";
import { HELP_TEXT, isHelp } from "../../src/adapters/bot/help.js";
import { SentIds, selfIdsOf, shouldHandle } from "../../src/adapters/bot/routing.js";
import { StatusMessage } from "../../src/adapters/bot/status.js";
import { formatSummary } from "../../src/adapters/bot/summary.js";
import { cleanupTempDirs } from "../../src/adapters/bot/tempCleanup.js";
import type { ConvertResult } from "../../src/pipeline/convert.js";
import { RateLimiter } from "../../src/utils/rateLimit.js";

const origin = { key: { id: "o1", remoteJid: "x@s.whatsapp.net" } } as WAMessage;

describe("StatusMessage", () => {
  it("sends once, then edits the same message; skips identical text", async () => {
    const calls: Record<string, unknown>[] = [];
    const sock = {
      sendMessage: vi.fn(async (_jid: string, content: Record<string, unknown>) => {
        calls.push(content);
        return { key: { id: "s1", remoteJid: "x@s.whatsapp.net" } };
      }),
    } as unknown as WASocket;
    const st = new StatusMessage(sock, origin);
    await st.set("⏳ uno");
    await st.set("⏳ uno");
    await st.set("✔ dos");
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ text: "⏳ uno" });
    expect(calls[1]).toEqual({ text: "✔ dos", edit: { id: "s1", remoteJid: "x@s.whatsapp.net" } });
  });

  it("falls back to a new message when editing fails", async () => {
    let n = 0;
    const sock = {
      sendMessage: vi.fn(async (_j: string, content: Record<string, unknown>) => {
        n++;
        if ("edit" in content) throw new Error("edit not supported");
        return { key: { id: `s${n}` } };
      }),
    } as unknown as WASocket;
    const st = new StatusMessage(sock, origin);
    await st.set("a");
    await st.set("b");
    expect(sock.sendMessage).toHaveBeenLastCalledWith("x@s.whatsapp.net", { text: "b" }, { quoted: origin });
  });
});

describe("RateLimiter", () => {
  it("allows max per window per key, then reports the wait", () => {
    const r = new RateLimiter(2, 60_000);
    expect(r.take("a", 0)).toBe(0);
    expect(r.take("a", 1000)).toBe(0);
    expect(r.take("a", 2000)).toBe(58_000);
    expect(r.take("b", 2000)).toBe(0); // other users unaffected
    expect(r.take("a", 61_000)).toBe(0); // window slid
  });
});

describe("self-chat-only routing", () => {
  const ctx = (selfChatOnly: boolean) => ({
    allowed: new Set<string>(),
    sent: new SentIds(),
    selfChatOnly,
    selfIds: selfIdsOf({ id: "5215500000001:8@s.whatsapp.net", lid: "100000000000001:8@lid" }),
  });
  const own = (remoteJid: string) => ({ type: "notify", key: { fromMe: true, remoteJid, id: remoteJid } });

  it("off: own messages work in any chat", () => {
    expect(shouldHandle(own("1111@s.whatsapp.net"), ctx(false))).toBe(true);
  });
  it("on: only the chat with yourself (PN or LID form)", () => {
    expect(shouldHandle(own("1111@s.whatsapp.net"), ctx(true))).toBe(false);
    expect(shouldHandle(own("5215500000001@s.whatsapp.net"), ctx(true))).toBe(true);
    expect(shouldHandle(own("100000000000001@lid"), ctx(true))).toBe(true);
  });
});

describe("help", () => {
  it("matches /ayuda and /help; text covers m:ss and voz", () => {
    expect(isHelp("/ayuda")).toBe(true);
    expect(isHelp(" !help ")).toBe(true);
    expect(isHelp("/ayudame")).toBe(false);
    expect(HELP_TEXT).toMatch(/1:20 0:05/);
    expect(HELP_TEXT).toMatch(/voz/);
  });
});

describe("formatSummary", () => {
  const result = {
    warnings: ["Audio bajo"],
    stats: {
      sticker: { bytes: 480_000, animated: true, fps: 14, durationMs: 5000, quality: 30 },
      audio: { durationSec: 5, gainDb: 12 },
    },
  } as unknown as ConvertResult;
  it("states delivery, sizes in m:ss and warnings", () => {
    const text = formatSummary(result, "native");
    expect(text).toMatch(/^✔ Listo · con sonido 🔊/);
    expect(text).toMatch(/469 KB · 14 fps · 0:05 · calidad 30 · 🔊 0:05 \(\+12 dB\)/);
    expect(text).toMatch(/⚠️ Audio bajo/);
  });
});

describe("cleanupTempDirs", () => {
  it("removes only prefixed folders", async () => {
    const root = await mkdtemp(join(tmpdir(), "sva-clean-"));
    try {
      await mkdir(join(root, "sva-bot-a"));
      await mkdir(join(root, "sva-bot-b"));
      await mkdir(join(root, "keep-me"));
      expect(await cleanupTempDirs("sva-bot-", root)).toBe(2);
      expect(await readdir(root)).toEqual(["keep-me"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
