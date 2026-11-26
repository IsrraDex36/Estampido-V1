import { randomBytes } from "node:crypto";
import { initAuthCreds } from "baileys";
import { describe, expect, it } from "vitest";
import {
  memoryAuthState,
  openSession,
  SessionError,
  sealKeyFrom,
  sealSession,
} from "../../src/adapters/bot/selfSession.js";

const key = sealKeyFrom(randomBytes(32));

describe("sealed self sessions (the browser keeps them, only this server can open them)", () => {
  it("round-trips the WhatsApp credentials and keys exactly, Buffers included", async () => {
    const { state, snapshot } = memoryAuthState();
    await state.keys.set({ "pre-key": { "1": { public: Buffer.from([1, 2, 3]), private: Buffer.from([4, 5]) } } });
    const sealed = sealSession(snapshot(), key);
    expect(sealed.startsWith("s1.")).toBe(true);
    expect(sealed).not.toContain(Buffer.from(state.creds.noiseKey.private).toString("base64")); // not readable
    const back = openSession(sealed, key);
    expect(Buffer.from(back.creds.noiseKey.private).equals(Buffer.from(state.creds.noiseKey.private))).toBe(true);
    const restored = memoryAuthState(back);
    const got = await restored.state.keys.get("pre-key", ["1", "2"]);
    expect(Buffer.from(got["1"]?.public as Uint8Array)).toEqual(Buffer.from([1, 2, 3]));
    expect(got["2"]).toBeUndefined();
  });

  it("useless with another server's key, tampered, or garbage", () => {
    const sealed = sealSession({ creds: initAuthCreds(), keys: {} }, key);
    const other = sealKeyFrom(randomBytes(32));
    expect(() => openSession(sealed, other)).toThrow(SessionError);
    const flipped = `${sealed.slice(0, -4)}${sealed.slice(-4) === "AAAA" ? "BBBB" : "AAAA"}`;
    expect(() => openSession(flipped, key)).toThrow(SessionError);
    expect(() => openSession("hola", key)).toThrow(SessionError);
  });

  it("deleting a key removes it from what gets sealed (no stale secrets kept)", async () => {
    const { state, snapshot } = memoryAuthState();
    await state.keys.set({ session: { a: Buffer.from([9]) } });
    await state.keys.set({ session: { a: null } });
    expect(snapshot().keys.session).toEqual({});
  });

  it("the sealing key is stable per server secret and different across servers", () => {
    const s = randomBytes(32);
    expect(sealKeyFrom(s).equals(sealKeyFrom(s))).toBe(true);
    expect(sealKeyFrom(s).equals(sealKeyFrom(randomBytes(32)))).toBe(false);
  });
});
