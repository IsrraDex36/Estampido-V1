import type { WASocket } from "baileys";
import { describe, expect, it, vi } from "vitest";
import { MAX_OFFLINE_AGE_SEC, SentIds, shouldHandle, trackOwnSends } from "../../src/adapters/bot/routing.js";

const allowed = new Set(["595981234567"]);
const NOW = 1_800_000_000;
const own = { fromMe: true, remoteJid: "595900000000@s.whatsapp.net" };

describe("shouldHandle", () => {
  const sent = new SentIds();
  const ctx = { allowed, sent, nowSec: NOW };

  it("real-time own (fromMe) and allowed messages", () => {
    expect(shouldHandle({ type: "notify", key: { ...own, id: "a" } }, ctx)).toBe(true);
    expect(shouldHandle({ type: "notify", key: { remoteJid: "595981234567@s.whatsapp.net", id: "b" } }, ctx)).toBe(
      true,
    );
    expect(shouldHandle({ type: "notify", key: { remoteJid: "111@s.whatsapp.net", id: "c" } }, ctx)).toBe(false);
  });

  it("append (sent while offline) only if recent", () => {
    const at = (age: number) => ({ type: "append", key: { ...own, id: `x${age}` }, messageTimestamp: NOW - age });
    expect(shouldHandle(at(10), ctx)).toBe(true);
    expect(shouldHandle(at(MAX_OFFLINE_AGE_SEC), ctx)).toBe(true);
    expect(shouldHandle(at(MAX_OFFLINE_AGE_SEC + 1), ctx)).toBe(false);
    expect(shouldHandle({ type: "append", key: { ...own, id: "nots" } }, ctx)).toBe(false);
    expect(
      shouldHandle({ type: "append", key: { ...own, id: "long" }, messageTimestamp: { toNumber: () => NOW - 5 } }, ctx),
    ).toBe(true);
  });

  it("never the bot's own sends, even as notify", () => {
    const s = new SentIds();
    s.add("mine");
    expect(shouldHandle({ type: "notify", key: { ...own, id: "mine" } }, { allowed, sent: s, nowSec: NOW })).toBe(
      false,
    );
    expect(
      shouldHandle(
        { type: "append", key: { ...own, id: "mine" }, messageTimestamp: NOW },
        { allowed, sent: s, nowSec: NOW },
      ),
    ).toBe(false);
  });

  it("ignores unknown upsert types", () => {
    expect(shouldHandle({ type: "other", key: { ...own, id: "o" } }, ctx)).toBe(false);
  });
});

describe("SentIds", () => {
  it("is bounded (evicts oldest)", () => {
    const s = new SentIds(2);
    s.add("1");
    s.add("2");
    s.add("3");
    expect([s.has("1"), s.has("2"), s.has("3")]).toEqual([false, true, true]);
    expect(s.has(undefined)).toBe(false);
  });
});

describe("trackOwnSends", () => {
  it("records the id before Baileys sends (no race with own upsert)", async () => {
    const sent = new SentIds();
    let seenDuringSend = false;
    const original = vi.fn(async (_jid: string, _c: unknown, opts: { messageId?: string }) => {
      seenDuringSend = sent.has(opts.messageId); // what an upsert handler would see mid-send
      return undefined;
    });
    const sock = { sendMessage: original, user: { id: "595900000000:1@s.whatsapp.net" } } as unknown as WASocket;
    trackOwnSends(sock, sent);
    await sock.sendMessage("x@s.whatsapp.net", { text: "hola" });
    const id = original.mock.calls[0]?.[2].messageId;
    expect(id).toBeTruthy();
    expect(seenDuringSend).toBe(true);

    await sock.sendMessage("x@s.whatsapp.net", { text: "hola" }, { messageId: "custom" });
    expect(sent.has("custom")).toBe(true);
  });
});
