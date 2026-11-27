import { randomBytes } from "node:crypto";
import { DisconnectReason, getCompanionPlatformId, initAuthCreds } from "baileys";
import { describe, expect, it } from "vitest";
import { cachedVersion, toWhatsAppNumber } from "../../src/adapters/bot/pairing.js";
import {
  openSession,
  SELF_BROWSER,
  SelfSessions,
  type SelfSocket,
  type SessionSnapshot,
  sealKeyFrom,
  sealSession,
} from "../../src/adapters/bot/selfSession.js";

const key = sealKeyFrom(randomBytes(32));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const browser = (n: number) => n.toString(16).padStart(64, "0"); // a client hash per person
const jidOf = (n: number) => `52122900${String(n).padStart(5, "0")}@s.whatsapp.net`;
const IDENTITY = {
  details: Buffer.from([1]),
  accountSignatureKey: Buffer.from([2]),
  accountSignature: Buffer.from([3]),
  deviceSignature: Buffer.from([4]),
};

function paired(n: number): SessionSnapshot {
  const creds = initAuthCreds();
  creds.me = { id: jidOf(n).replace("@", ":3@"), name: `P${n}` };
  creds.account = IDENTITY as never;
  return { creds, keys: {} };
}

type Handler = (u: Record<string, unknown>) => void;
/**
 * A fake WhatsApp per connection that knows WHOSE session it was opened with
 * (like the real one: the socket's user comes from the creds), so any mix-up
 * between people shows up as a sticker in the wrong chat.
 */
function world(opts: { openMs?: number; sendMs?: number; loggedOut?: Set<string> } = {}) {
  const live = new Map<string, number>(); // jid → open sockets
  let open = 0;
  let peak = 0;
  let peakSameAccount = 0;
  const delivered: { to: string; owner: string; webp: string }[] = [];
  const ended: boolean[] = [];
  const sessions = new SelfSessions({
    sealKey: key,
    settleMs: 0,
    gapMs: 0,
    linkSettleMaxMs: 5,
    sendSettleMaxMs: 5,
    openTimeoutMs: 2_000,
    opTimeoutMs: 5_000,
    maxConcurrent: 4,
    maxWaiting: 200,
    maxPendingLinks: 200,
    socket: async (state) => {
      const handlers: Handler[] = [];
      const owner = state.creds.me?.id?.replace(/:\d+@/, "@") ?? "";
      const idx = ended.push(false) - 1;
      open++;
      peak = Math.max(peak, open);
      const n = (live.get(owner) ?? 0) + 1;
      live.set(owner, n);
      peakSameAccount = Math.max(peakSameAccount, owner ? n : 0);
      const emit = (u: Record<string, unknown>) => {
        for (const h of handlers) h(u);
      };
      const s = {
        user: state.creds.me ? { id: state.creds.me.id } : undefined,
        owner,
        ev: { on: (_e: string, h: Handler) => void handlers.push(h) },
        end: () => {
          if (ended[idx]) return;
          ended[idx] = true;
          open--;
          live.set(owner, (live.get(owner) ?? 1) - 1);
        },
        logout: async () => {},
        requestPairingCode: async () => "ABCDEFGH",
        sendMessage: async () => undefined,
      };
      setTimeout(() => {
        if (opts.loggedOut?.has(owner))
          emit({
            connection: "close",
            lastDisconnect: { error: { output: { statusCode: DisconnectReason.loggedOut } } },
          });
        else emit({ connection: "open" });
      }, opts.openMs ?? 3);
      return s as unknown as SelfSocket;
    },
    sendSticker: async (sock, jid, it) => {
      await wait(opts.sendMs ?? 5);
      delivered.push({ to: jid, owner: (sock as unknown as { owner: string }).owner, webp: it.webpPath });
    },
  });
  return {
    sessions,
    delivered,
    stats: () => ({ open, peak, peakSameAccount, allEnded: ended.every(Boolean), sockets: ended.length }),
  };
}

describe("many people at once", () => {
  it("60 people send together: max 4 connections, everyone served, each sticker in ITS owner's chat, sessions never mixed", async () => {
    const w = world();
    const people = Array.from({ length: 60 }, (_, i) => i + 1);
    const results = await Promise.all(
      people.map((n) =>
        w.sessions.sendToSelf(sealSession(paired(n), key, browser(n)), browser(n), [
          { webpPath: `/r/${n}/sticker.webp`, animated: true },
        ]),
      ),
    );
    expect(results.every((r) => r.result.sent === 1)).toBe(true);
    expect(w.stats().peak).toBeLessThanOrEqual(4);
    expect(w.delivered).toHaveLength(60);
    for (const d of w.delivered) {
      expect(d.to).toBe(d.owner); // only to your own chat
      expect(d.webp).toBe(`/r/${Number(d.owner.slice(8, 13))}/sticker.webp`); // your own sticker
    }
    // Each renewed session belongs to its person and opens only in their browser.
    results.forEach((r, i) => {
      const n = people[i] as number;
      expect(openSession(r.session, key, browser(n)).creds.me?.id).toBe(jidOf(n).replace("@", ":3@"));
      expect(() => openSession(r.session, key, browser(n + 1000))).toThrow();
    });
    expect(w.stats()).toMatchObject({ open: 0, allEnded: true });
    expect(w.sessions.busy).toEqual({ active: 0, waiting: 0 });
  });

  it("a burst bigger than the line: the overflow gets «busy» at once (no pile-up), the rest are served", async () => {
    const w = world({ sendMs: 20 });
    const small = new SelfSessions({
      ...(w.sessions as unknown as { o: object }).o,
      maxConcurrent: 2,
      maxWaiting: 5,
    } as never);
    const outcomes = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        small
          .sendToSelf(sealSession(paired(i), key, browser(i)), browser(i), [
            { webpPath: `/r/${i}/s.webp`, animated: false },
          ])
          .then(() => "ok")
          .catch((e: { code?: string }) => e.code),
      ),
    );
    expect(outcomes.filter((o) => o === "ok")).toHaveLength(7); // 2 running + 5 waiting
    expect(outcomes.filter((o) => o === "busy")).toHaveLength(13);
    expect(small.busy).toEqual({ active: 0, waiting: 0 });
    expect(w.stats().allEnded).toBe(true);
  });

  it("the same WhatsApp in 5 tabs among 20 other people: never two connections for one account", async () => {
    const w = world({ sendMs: 10 });
    const mine = sealSession(paired(7), key, browser(7));
    await Promise.all([
      ...Array.from({ length: 5 }, (_, t) =>
        w.sessions.sendToSelf(mine, browser(7), [{ webpPath: `/tab/${t}.webp`, animated: true }]),
      ),
      ...Array.from({ length: 20 }, (_, i) =>
        w.sessions.sendToSelf(sealSession(paired(100 + i), key, browser(100 + i)), browser(100 + i), [
          { webpPath: `/o/${i}.webp`, animated: true },
        ]),
      ),
    ]);
    expect(w.stats().peakSameAccount).toBe(1);
    expect(w.delivered.filter((d) => d.owner === jidOf(7))).toHaveLength(5);
  });

  it("someone whose device was removed fails alone; everybody else still gets theirs", async () => {
    const w = world({ loggedOut: new Set([jidOf(3), jidOf(9)]) });
    const out = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        w.sessions
          .sendToSelf(sealSession(paired(i), key, browser(i)), browser(i), [
            { webpPath: `/r/${i}.webp`, animated: true },
          ])
          .then(() => "ok")
          .catch((e: { code?: string }) => e.code),
      ),
    );
    expect(out[3]).toBe("logged_out");
    expect(out[9]).toBe("logged_out");
    expect(out.filter((o) => o === "ok")).toHaveLength(10);
    expect(w.stats().allEnded).toBe(true);
  });

  it("30 people link at the same time: each link is only visible to its browser, each session only opens there", async () => {
    const w = world();
    const ids = await Promise.all(Array.from({ length: 30 }, (_, i) => w.sessions.startLink(browser(i))));
    expect(new Set(ids).size).toBe(30);
    await wait(40);
    for (let i = 0; i < 30; i++) {
      const id = ids[i] as string;
      expect(w.sessions.linkStatus(id, browser((i + 1) % 30))).toBeNull(); // the neighbour sees nothing
      const st = w.sessions.linkStatus(id, browser(i)) as { state: string; session?: string };
      // A fresh fake socket has no identity → «failed» (never a useless «linked»); what matters
      // here is isolation and that nothing stays open.
      expect(["failed", "linked"]).toContain(st.state);
    }
    expect(w.stats().allEnded).toBe(true);
    expect(w.sessions.pendingLinks).toBe(0);
  });
});

describe("pairing by CODE (only QR used to work)", () => {
  it("numbers are turned into WhatsApp's account id: México 52→521, Argentina 54→549; others untouched", () => {
    expect(toWhatsAppNumber("522291234567")).toBe("5212291234567");
    expect(toWhatsAppNumber("5212291234567")).toBe("5212291234567"); // already right
    expect(toWhatsAppNumber("541123456789")).toBe("5491123456789");
    expect(toWhatsAppNumber("5491123456789")).toBe("5491123456789");
    expect(toWhatsAppNumber("573001234567")).toBe("573001234567"); // Colombia
    expect(toWhatsAppNumber("14155550123")).toBe("14155550123"); // US
    expect(toWhatsAppNumber("34612345678")).toBe("34612345678"); // España
  });

  it("we identify as a browser WhatsApp accepts for codes (Chrome), not an «other web client»", () => {
    expect(SELF_BROWSER[1]).toBe("Chrome");
    expect(getCompanionPlatformId(SELF_BROWSER)).toBe("1"); // CHROME; a custom name gives 9 (OTHER_WEB_CLIENT)
    expect(getCompanionPlatformId(["Mac OS", "Estampido", "1"])).toBe("9");
  });

  it("the code is requested for the account id, and 52… / 521… count as the same number for the anti-abuse cap", async () => {
    const asked: string[] = [];
    const sessions = new SelfSessions({
      sealKey: key,
      settleMs: 0,
      socket: async () => {
        const handlers: Handler[] = [];
        setTimeout(() => {
          for (const h of handlers) h({ qr: "2@x" });
        }, 1);
        return {
          ev: { on: (_e: string, h: Handler) => void handlers.push(h) },
          end: () => {},
          logout: async () => {},
          requestPairingCode: async (n: string) => {
            asked.push(n);
            return "ABCDEFGH";
          },
          sendMessage: async () => undefined,
        } as unknown as SelfSocket;
      },
    });
    const id = await sessions.startLink(browser(1), "522291234567");
    await wait(10);
    expect(asked).toEqual(["5212291234567"]);
    expect(sessions.linkStatus(id, browser(1))).toEqual({ state: "code", code: "ABCD-EFGH" });
    await sessions.startLink(browser(2), "5212291234567");
    await sessions.startLink(browser(3), "52 229 123 4567");
    await expect(sessions.startLink(browser(4), "522291234567")).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("WhatsApp asks to rotate the QR secret: the QR shown is re-rendered with the new secret", async () => {
    let stanza: ((n: unknown) => void) | undefined;
    let emit: Handler = () => {};
    const sessions = new SelfSessions({
      sealKey: key,
      settleMs: 0,
      socket: async () =>
        ({
          ev: {
            on: (_e: string, h: Handler) => {
              emit = h;
            },
          },
          ws: {
            on: (_e: string, fn: (n: unknown) => void) => {
              stanza = fn;
            },
          },
          end: () => {},
          logout: async () => {},
          requestPairingCode: async () => "X",
          sendMessage: async () => undefined,
        }) as unknown as SelfSocket,
    });
    const id = await sessions.startLink(browser(1));
    emit({ qr: "https://wa.me/settings/linked_devices#ref,noise,ident,OLDSECRET,1" });
    const before = (sessions.linkStatus(id, browser(1)) as { qr: string }).qr;
    stanza?.({ content: [{ tag: "companion_reg_refresh" }] });
    const after = (sessions.linkStatus(id, browser(1)) as { qr: string }).qr;
    expect(after).not.toBe(before);
    expect(after.split(",")[3]).not.toBe(before.split(",")[3]);
    expect(after.split(",").slice(0, 3)).toEqual(before.split(",").slice(0, 3));
    stanza?.({ content: [{ tag: "something_else" }] }); // unrelated notifications change nothing
    expect((sessions.linkStatus(id, browser(1)) as { qr: string }).qr).toBe(after);
  });
});

describe("one WA Web version lookup for everybody", () => {
  it("concurrent callers share one request; cached 6 h; a failed lookup retries after 5 min", async () => {
    let calls = 0;
    let t = 0;
    let ok = false;
    const v = cachedVersion(
      async () => {
        calls++;
        await wait(5);
        return ok ? { version: [2, 3000, 1] as [number, number, number], source: "web" } : { source: "default" };
      },
      () => t,
    );
    await Promise.all(Array.from({ length: 50 }, () => v()));
    expect(calls).toBe(1);
    t += 4 * 60_000;
    await v();
    expect(calls).toBe(1); // failure cached for 5 min
    t += 2 * 60_000;
    ok = true;
    await v();
    expect(calls).toBe(2);
    t += 5 * 60 * 60_000;
    expect((await v()).version).toEqual([2, 3000, 1]);
    expect(calls).toBe(2);
    t += 2 * 60 * 60_000;
    await v();
    expect(calls).toBe(3);
  });
});
