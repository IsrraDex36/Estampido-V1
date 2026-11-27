import { createCipheriv, randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { BufferJSON, DisconnectReason, initAuthCreds } from "baileys";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Gate,
  KeyedLock,
  memoryAuthState,
  openSession,
  SESSION_MAX_AGE_MS,
  SelfSessions,
  type SelfSocket,
  SessionError,
  type SessionSnapshot,
  sealKeyFrom,
  sealSession,
} from "../../src/adapters/bot/selfSession.js";

const secret = randomBytes(32);
const key = sealKeyFrom(secret);
const A = "a".repeat(64); // browser A (client hash)
const B = "b".repeat(64); // browser B
const ME = "5212290000000:7@s.whatsapp.net";

/** A linked (registered) snapshot, as after a real pairing. */
function linked(id = ME): SessionSnapshot {
  const creds = initAuthCreds();
  creds.registered = true;
  creds.me = { id, name: "Yo" };
  return { creds, keys: { "pre-key": { "1": { public: Buffer.from([1, 2]), private: Buffer.from([3]) } } } as never };
}

const codeOf = (e: unknown) => (e instanceof SessionError ? e.code : String(e));

// ── a fake WhatsApp socket ──────────────────────────────────────────────────

type Handler = (u: Record<string, unknown>) => void;
class FakeSock {
  handlers: Handler[] = [];
  ended = false;
  loggedOut = false;
  sentTo: string[] = [];
  user = { id: ME };
  ev = { on: (_e: string, h: Handler) => void this.handlers.push(h) } as never;
  emit(u: Record<string, unknown>) {
    for (const h of this.handlers) h(u);
  }
  end() {
    this.ended = true;
  }
  async logout() {
    this.loggedOut = true;
  }
  async requestPairingCode() {
    return "ABCDEFGH";
  }
  async sendMessage(jid: string) {
    this.sentTo.push(jid);
    return undefined;
  }
}
const closeWith = (statusCode: number) => ({
  connection: "close",
  lastDisconnect: { error: { output: { statusCode } } },
});

/** SelfSessions driven by fake sockets; `script` decides what each new socket does. */
function setup(
  over: Partial<ConstructorParameters<typeof SelfSessions>[0]> = {},
  script: (s: FakeSock, n: number) => void = (s) => setTimeout(() => s.emit({ connection: "open" }), 1),
) {
  const socks: FakeSock[] = [];
  const sent: { jid: string; webp: string }[] = [];
  const sessions = new SelfSessions({
    sealKey: key,
    settleMs: 0,
    gapMs: 0,
    linkSettleMaxMs: 5,
    sendSettleMaxMs: 5,
    openTimeoutMs: 200,
    opTimeoutMs: 1_000,
    socket: async () => {
      const s = new FakeSock();
      socks.push(s);
      script(s, socks.length);
      return s as unknown as SelfSocket;
    },
    sendSticker: async (_sock, jid, it) => {
      sent.push({ jid, webp: it.webpPath });
    },
    ...over,
  });
  return { sessions, socks, sent };
}

afterEach(() => vi.restoreAllMocks());

// ── sealing ─────────────────────────────────────────────────────────────────

describe("sealed sessions", () => {
  it("round-trip exactly (Buffers included) for the browser they were sealed for", () => {
    const s = linked();
    const back = openSession(sealSession(s, key, A), key, A);
    expect(back.creds.me?.id).toBe(ME);
    expect(Buffer.from(back.creds.noiseKey.private).equals(Buffer.from(s.creds.noiseKey.private))).toBe(true);
    const preKey = back.keys["pre-key"] as Record<string, { public: Uint8Array }>;
    expect(Buffer.from(preKey["1"]?.public ?? [])).toEqual(Buffer.from([1, 2]));
  });

  it("another browser, another server or another epoch can't open it", () => {
    const sealed = sealSession(linked(), key, A);
    expect(codeOf(tryOpen(sealed, key, B))).toBe("invalid");
    expect(codeOf(tryOpen(sealed, sealKeyFrom(randomBytes(32)), A))).toBe("invalid");
    expect(codeOf(tryOpen(sealed, sealKeyFrom(secret, "2"), A))).toBe("invalid"); // epoch bumped → revoked
  });

  it("any tampering, truncation, garbage or old format is refused", () => {
    const sealed = sealSession(linked(), key, A);
    const raw = Buffer.from(sealed.slice(3), "base64url");
    for (const at of [0, 11, 12, 27, 28, raw.length - 1]) {
      const t = Buffer.from(raw);
      t[at] = (t[at] as number) ^ 0xff;
      expect(codeOf(tryOpen(`s2.${t.toString("base64url")}`, key, A)), `byte ${at}`).toBe("invalid");
    }
    expect(codeOf(tryOpen(`s2.${raw.subarray(0, 20).toString("base64url")}`, key, A))).toBe("invalid");
    for (const junk of ["", "s2.", "s2.@@@", "hola", `s1.${raw.toString("base64url")}`]) {
      expect(codeOf(tryOpen(junk, key, A)), junk).toBe("invalid");
    }
  });

  it("expires after 180 days without use; every use renews it", () => {
    const t0 = Date.UTC(2026, 0, 1);
    const sealed = sealSession(linked(), key, A, t0);
    expect(() => openSession(sealed, key, A, t0 + SESSION_MAX_AGE_MS - 1)).not.toThrow();
    expect(codeOf(tryOpen(sealed, key, A, t0 + SESSION_MAX_AGE_MS + 1))).toBe("expired");
  });

  it("nothing readable inside; the same session never seals the same way twice", () => {
    const s = linked();
    const a = sealSession(s, key, A);
    const b = sealSession(s, key, A);
    expect(a).not.toBe(b); // random IV
    const priv = Buffer.from(s.creds.noiseKey.private).toString("base64");
    expect(a).not.toContain(priv);
    expect(Buffer.from(a.slice(3), "base64url").toString("latin1")).not.toContain("noiseKey");
  });

  it("refuses a zip bomb even when it's correctly sealed", () => {
    // 64 MB of zeros gzips to ~64 KB: a valid-looking payload that would explode on open.
    const bomb = gzipSync(Buffer.alloc(64 * 1024 * 1024));
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", key, iv);
    c.setAAD(Buffer.from(`s2:${A}`));
    const body = Buffer.concat([c.update(bomb), c.final()]);
    const sealed = `s2.${Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url")}`;
    expect(codeOf(tryOpen(sealed, key, A))).toBe("invalid");
  });

  it("a sealed payload without the expected shape is refused", () => {
    const plain = gzipSync(Buffer.from(JSON.stringify({ nope: true }, BufferJSON.replacer)));
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", key, iv);
    c.setAAD(Buffer.from(`s2:${A}`));
    const body = Buffer.concat([c.update(plain), c.final()]);
    expect(codeOf(tryOpen(`s2.${Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url")}`, key, A))).toBe(
      "invalid",
    );
  });
});

function tryOpen(sealed: string, k: Buffer, bind: string, now?: number): unknown {
  try {
    openSession(sealed, k, bind, now);
    return null;
  } catch (e) {
    return e;
  }
}

describe("in-memory auth state", () => {
  it("deletes keys set to null and never shares state with the snapshot it came from", async () => {
    const from = linked();
    const { state, snapshot } = memoryAuthState(from);
    await state.keys.set({ session: { x: Buffer.from([1]) } });
    await state.keys.set({ session: { x: null } });
    expect(snapshot().keys.session).toEqual({});
    await state.keys.set({ "pre-key": { "1": null } });
    expect(from.keys["pre-key"]?.["1"]).toBeDefined(); // the original stays intact
  });
});

// ── concurrency primitives ─────────────────────────────────────────────────

describe("gate and lock", () => {
  it("gate: at most N at once; a bounded line; a waiter that gives up never swallows a free slot", async () => {
    const g = new Gate(1, 1);
    let release: () => void = () => {};
    const first = g.run(() => new Promise<void>((r) => (release = r)));
    const giveUp = g.run(async () => "late", 20); // waits, then gives up
    await expect(g.run(async () => 0)).rejects.toMatchObject({ code: "busy" }); // line full
    await expect(giveUp).rejects.toMatchObject({ code: "busy" });
    const next = g.run(async () => "ran"); // joins the line after the dead entry left it
    release();
    await first;
    await expect(next).resolves.toBe("ran"); // regression: used to hang forever
    expect(g.busy).toEqual({ active: 0, waiting: 0 });
  });

  it("lock: same key strictly in order (never overlapping), other keys in parallel, errors don't jam it", async () => {
    const lock = new KeyedLock();
    let inside = 0;
    let maxInside = 0;
    const job = (ms: number) => async () => {
      inside++;
      maxInside = Math.max(maxInside, inside);
      await new Promise((r) => setTimeout(r, ms));
      inside--;
    };
    await Promise.all([
      lock.run("me", job(15)),
      lock.run("me", job(5)),
      lock.run("me", async () => Promise.reject(new Error("x"))).catch(() => {}),
      lock.run("me", job(5)),
    ]);
    expect(maxInside).toBe(1);
    let parallel = 0;
    let peak = 0;
    const p = (k: string) =>
      lock.run(k, async () => {
        parallel++;
        peak = Math.max(peak, parallel);
        await new Promise((r) => setTimeout(r, 10));
        parallel--;
      });
    await Promise.all([p("a"), p("b"), p("c")]);
    expect(peak).toBe(3);
    expect(lock.size).toBe(0); // nothing kept around
  });
});

// ── linking ─────────────────────────────────────────────────────────────────

describe("linking your own WhatsApp", () => {
  it("by phone: a code; after the restart WhatsApp asks for, the sealed session goes ONLY to the browser that started it, once", async () => {
    const { sessions, socks } = setup({}, (s, n) => {
      if (n === 1) {
        setTimeout(() => s.emit({ qr: "2@qr" }), 1);
        setTimeout(() => s.emit(closeWith(DisconnectReason.restartRequired)), 10);
      } else setTimeout(() => s.emit({ connection: "open" }), 1);
    });
    const id = await sessions.startLink(A, "5212290000000");
    await wait(5);
    expect(sessions.linkStatus(id, A)).toEqual({ state: "code", code: "ABCD-EFGH" });
    expect(sessions.linkStatus(id, B)).toBeNull(); // another browser can't even see it
    await wait(30);
    const st = sessions.linkStatus(id, B);
    expect(st).toBeNull(); // hijack attempt: nothing
    const mine = sessions.linkStatus(id, A);
    expect(mine?.state).toBe("linked");
    expect(sessions.linkStatus(id, A)).toBeNull(); // handed out once
    expect(socks.every((s) => s.ended)).toBe(true); // no socket left open
    expect(sessions.pendingLinks).toBe(0);
    // The session belongs to browser A.
    const sealed = (mine as { session: string }).session;
    expect(() => openSession(sealed, key, A)).not.toThrow();
    expect(codeOf(tryOpen(sealed, key, B))).toBe("invalid");
  });

  it("by QR (computers): the QR is exposed only to its browser", async () => {
    const { sessions } = setup({}, (s) => setTimeout(() => s.emit({ qr: "2@abc" }), 1));
    const id = await sessions.startLink(A);
    await wait(5);
    expect(sessions.linkStatus(id, A)).toEqual({ state: "qr", qr: "2@abc" });
    expect(sessions.linkStatus(id, B)).toBeNull();
  });

  it("anti-harassment: max 3 codes per number per hour; other numbers unaffected; bad numbers refused", async () => {
    const { sessions } = setup({}, () => {});
    for (let i = 0; i < 3; i++) await sessions.startLink(A, "5212290000000");
    await expect(sessions.startLink(B, "5212290000000")).rejects.toMatchObject({ code: "rate_limited" }); // even from another browser
    await expect(sessions.startLink(A, "5215511111111")).resolves.toBeTruthy();
    await expect(sessions.startLink(A, "12")).rejects.toMatchObject({ code: "invalid" });
  });

  it("abandoned links close their socket by themselves; too many pending → busy", async () => {
    const { sessions, socks } = setup({ linkTtlMs: 20, maxPendingLinks: 2 }, () => {});
    await sessions.startLink(A);
    await sessions.startLink(B);
    await expect(sessions.startLink(A)).rejects.toMatchObject({ code: "busy" });
    await wait(40);
    expect(sessions.pendingLinks).toBe(0);
    expect(socks.every((s) => s.ended)).toBe(true);
  });

  it("a pairing that doesn't finish becomes «failed» for its browser", async () => {
    const { sessions } = setup({}, (s) => setTimeout(() => s.emit(closeWith(DisconnectReason.connectionClosed)), 1));
    const id = await sessions.startLink(A);
    await wait(10);
    expect(sessions.linkStatus(id, A)?.state).toBe("failed");
  });
});

// ── sending ─────────────────────────────────────────────────────────────────

describe("sending to your own chat", () => {
  const item = (n: number) => ({ webpPath: `/r/${n}/sticker.webp`, animated: true });

  it("sends only to your own chat, in order, and returns a renewed session for the same browser", async () => {
    const { sessions, sent, socks } = setup();
    const sealed = sealSession(linked(), key, A);
    const r = await sessions.sendToSelf(sealed, A, [item(1), item(2), item(3)]);
    expect(r.result).toEqual({ sent: 3 });
    expect(sent.map((s) => s.webp)).toEqual(["/r/1/sticker.webp", "/r/2/sticker.webp", "/r/3/sticker.webp"]);
    expect(new Set(sent.map((s) => s.jid))).toEqual(new Set(["5212290000000@s.whatsapp.net"])); // device suffix dropped: your chat
    expect(socks).toHaveLength(1); // one connection for all
    expect(socks[0]?.ended).toBe(true);
    expect(r.session).not.toBe(sealed);
    expect(() => openSession(r.session, key, A)).not.toThrow();
    expect(codeOf(tryOpen(r.session, key, B))).toBe("invalid");
  });

  it("refuses before connecting: other browser, unregistered session, 0 or > 30 items", async () => {
    const { sessions, socks } = setup();
    const sealed = sealSession(linked(), key, A);
    await expect(sessions.sendToSelf(sealed, B, [item(1)])).rejects.toMatchObject({ code: "invalid" });
    const fresh = sealSession({ creds: initAuthCreds(), keys: {} }, key, A);
    await expect(sessions.sendToSelf(fresh, A, [item(1)])).rejects.toMatchObject({ code: "invalid" });
    await expect(sessions.sendToSelf(sealed, A, [])).rejects.toMatchObject({ code: "invalid" });
    await expect(
      sessions.sendToSelf(
        sealed,
        A,
        Array.from({ length: 31 }, (_, i) => item(i)),
      ),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(socks).toHaveLength(0);
  });

  it("partial failures still count; all failing → send_failed", async () => {
    let n = 0;
    const flaky = setup({
      sendSticker: async () => {
        n++;
        if (n === 2) throw new Error("upload");
      },
    });
    const sealed = sealSession(linked(), key, A);
    expect((await flaky.sessions.sendToSelf(sealed, A, [item(1), item(2), item(3)])).result).toEqual({ sent: 2 });
    const broken = setup({
      sendSticker: async () => {
        throw new Error("x");
      },
    });
    await expect(broken.sessions.sendToSelf(sealed, A, [item(1)])).rejects.toMatchObject({ code: "send_failed" });
    expect(broken.socks[0]?.ended).toBe(true);
  });

  it("device removed from the phone → logged_out; no answer → timeout; hanging send → timeout; socket always closed", async () => {
    const sealed = sealSession(linked(), key, A);
    const gone = setup({}, (s) => setTimeout(() => s.emit(closeWith(DisconnectReason.loggedOut)), 1));
    await expect(gone.sessions.sendToSelf(sealed, A, [item(1)])).rejects.toMatchObject({ code: "logged_out" });
    const silent = setup({}, () => {});
    await expect(silent.sessions.sendToSelf(sealed, A, [item(1)])).rejects.toMatchObject({ code: "timeout" });
    const hang = setup({ opTimeoutMs: 50, sendSticker: () => new Promise(() => {}) });
    await expect(hang.sessions.sendToSelf(sealed, A, [item(1)])).rejects.toMatchObject({ code: "timeout" });
    for (const s of [...gone.socks, ...silent.socks, ...hang.socks]) expect(s.ended).toBe(true);
  });

  it("the same WhatsApp from two tabs never connects twice at once; different people do run in parallel", async () => {
    let open = 0;
    let peak = 0;
    const { sessions } = setup({
      sendSticker: async () => {
        open++;
        peak = Math.max(peak, open);
        await wait(15);
        open--;
      },
    });
    const mine = sealSession(linked(), key, A);
    await Promise.all([sessions.sendToSelf(mine, A, [item(1)]), sessions.sendToSelf(mine, A, [item(2)])]);
    expect(peak).toBe(1);
    peak = 0;
    const other = sealSession(linked("5215511111111:3@s.whatsapp.net"), key, B);
    await Promise.all([sessions.sendToSelf(mine, A, [item(1)]), sessions.sendToSelf(other, B, [item(2)])]);
    expect(peak).toBe(2);
  });

  it("logout removes the device; already removed counts as done", async () => {
    const { sessions, socks } = setup();
    await sessions.logout(sealSession(linked(), key, A), A);
    expect(socks[0]?.loggedOut).toBe(true);
    const gone = setup({}, (s) => setTimeout(() => s.emit(closeWith(DisconnectReason.loggedOut)), 1));
    await expect(gone.sessions.logout(sealSession(linked(), key, A), A)).resolves.toBeUndefined();
  });

  it("errors never carry the session (nothing to leak into logs)", async () => {
    const sealed = sealSession(linked(), key, A);
    const silent = setup({}, () => {});
    const err = await silent.sessions.sendToSelf(sealed, A, [item(1)]).catch((e: Error) => e);
    expect(String((err as Error).message)).not.toContain("s2.");
    expect(JSON.stringify(err)).not.toContain(sealed.slice(3, 40));
  });
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("robustness found in the field", () => {
  it("restored keys stay Node Buffers (the Signal code calls Buffer methods on them)", async () => {
    const sealed = sealSession(linked(), key, A);
    const { state } = memoryAuthState(openSession(sealed, key, A));
    const got = await state.keys.get("pre-key", ["1"]);
    expect(Buffer.isBuffer((got["1"] as { public: unknown }).public)).toBe(true);
    expect(Buffer.isBuffer(state.creds.noiseKey.private)).toBe(true);
  });

  it("linking waits for WhatsApp's first login to finish before handing out the session", async () => {
    const { sessions } = setup({ linkSettleMaxMs: 2_000 }, (s) => {
      setTimeout(() => s.emit({ connection: "open" }), 1);
      setTimeout(() => s.emit({ receivedPendingNotifications: true }), 60);
    });
    const id = await sessions.startLink(A);
    await wait(30);
    expect(sessions.linkStatus(id, A)?.state).toBe("waiting"); // still settling: not sealed yet
    await wait(60);
    expect(sessions.linkStatus(id, A)?.state).toBe("linked");
  });

  it("disconnect codes are logged for diagnosis — never the session", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sealed = sealSession(linked(), key, A);
    const gone = setup({}, (s) => setTimeout(() => s.emit(closeWith(DisconnectReason.loggedOut)), 1));
    await gone.sessions.sendToSelf(sealed, A, [{ webpPath: "/r/1/sticker.webp", animated: true }]).catch(() => {});
    const logged = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("código 401");
    expect(logged).not.toContain(sealed.slice(3, 30));
  });
});

describe("what the person is told", () => {
  it("a different message for each reason to link again", async () => {
    const { relinkReason } = await import("../../web/src/features/self/useSelfSend.js");
    expect(relinkReason("logged_out")).toMatch(/quitó este dispositivo/);
    expect(relinkReason("expired")).toMatch(/venció/);
    expect(relinkReason("invalid")).toMatch(/Actualizamos la seguridad/);
    expect(new Set(["logged_out", "expired", "invalid"].map(relinkReason)).size).toBe(3);
  });
});
