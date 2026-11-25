import { describe, expect, it } from "vitest";
import { describeChat, ignoreReason, SentIds } from "../../src/adapters/bot/routing.js";

describe("bot routing diagnostics", () => {
  const ctx = { allowed: new Set<string>(), sent: new SentIds(), nowSec: 1000 };
  it("explains why a message is ignored, or null when handled", () => {
    expect(
      ignoreReason({ type: "notify", key: { id: "a", fromMe: true, remoteJid: "1@s.whatsapp.net" } }, ctx),
    ).toBeNull();
    expect(
      ignoreReason({ type: "notify", key: { id: "b", fromMe: false, remoteJid: "999@s.whatsapp.net" } }, ctx),
    ).toMatch(/no permitido/);
    expect(
      ignoreReason(
        { type: "append", key: { id: "c", fromMe: true, remoteJid: "1@s.whatsapp.net" }, messageTimestamp: 1 },
        ctx,
      ),
    ).toMatch(/antiguo/);
  });
  it("masks numbers in logs", () => {
    expect(describeChat("120363000000000000@g.us")).toBe("grupo");
    expect(describeChat("5215512345678@s.whatsapp.net")).toBe("privado …5678");
    expect(describeChat("5215512345678@s.whatsapp.net", new Set(["5215512345678"]))).toBe("tu chat contigo");
  });
});
