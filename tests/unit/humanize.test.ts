import type { WASocket } from "baileys";
import { describe, expect, it, vi } from "vitest";
import {
  createHumanizer,
  replyLikeHuman,
  SendPacer,
  typingDelayMs,
  VariantPicker,
} from "../../src/adapters/bot/humanize.js";
import { extractCode } from "../../src/adapters/bot/links.js";
import { PHRASES } from "../../src/adapters/bot/phrases.js";
import { LINK_GREETINGS, linkGreeting } from "../../src/adapters/http/linkGreeting.js";

/** Deterministic random source. */
function seeded(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("VariantPicker", () => {
  it("never repeats the previous variant in the same chat, and uses all of them", () => {
    const p = new VariantPicker(seeded());
    const seen = new Set<string>();
    let prev = "";
    for (let i = 0; i < 300; i++) {
      const v = p.pick("linkOk", "chat-a", PHRASES.linkOk);
      expect(v).not.toBe(prev);
      prev = v;
      seen.add(v);
    }
    expect(seen.size).toBe(PHRASES.linkOk.length);
  });

  it("is roughly uniform (no variant starves)", () => {
    const p = new VariantPicker(seeded(7));
    const counts = new Map<string, number>();
    for (let i = 0; i < 3_000; i++) {
      const v = p.pick("k", "c", ["a", "b", "c", "d"]);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    for (const n of counts.values()) expect(n).toBeGreaterThan(600); // 750 expected each
  });

  it("chats and message kinds are independent; memory is bounded", () => {
    const p = new VariantPicker(() => 0, 3);
    expect(p.pick("k", "a", ["x", "y"])).toBe("x");
    expect(p.pick("k", "b", ["x", "y"])).toBe("x"); // another chat: free choice
    expect(p.pick("j", "a", ["x", "y"])).toBe("x"); // another kind: free choice
    expect(p.pick("k", "a", ["x", "y"])).toBe("y"); // same chat+kind: not «x» again
    for (const c of ["c", "d", "e", "f"]) p.pick("k", c, ["x", "y"]);
    expect(p.pick("k", "a", ["x", "y"])).toBe("x"); // forgotten (memory 3) → free again
    expect(() => p.pick("k", "a", [])).toThrow();
    expect(p.pick("k", "a", ["solo"])).toBe("solo");
  });

  it("rng edge values stay in range", () => {
    const p = new VariantPicker(() => 0.999999999);
    for (let i = 0; i < 10; i++) expect(["a", "b", "c"]).toContain(p.pick("k", "z", ["a", "b", "c"]));
  });
});

describe("typing delay", () => {
  it("grows with length, has jitter, stays within 0.7–3.2 s", () => {
    expect(typingDelayMs("ok", () => 0.5)).toBe(700);
    expect(typingDelayMs("x".repeat(60), () => 0.5)).toBe(1950);
    expect(typingDelayMs("x".repeat(500), () => 1)).toBe(3200);
    const r = seeded(3);
    const samples = Array.from({ length: 50 }, () => typingDelayMs("x".repeat(60), r));
    expect(new Set(samples).size).toBeGreaterThan(30); // not a fixed rhythm
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(700);
  });
});

describe("SendPacer", () => {
  it("serializes sends with a random gap between any two (never a fixed interval)", async () => {
    let now = 0;
    const waits: number[] = [];
    const pacer = new SendPacer({
      minGapMs: 700,
      jitterMs: 900,
      rng: seeded(5),
      now: () => now,
      sleep: async (ms) => {
        waits.push(ms);
        now += ms;
      },
    });
    const sentAt: number[] = [];
    await Promise.all(Array.from({ length: 8 }, () => pacer.turn().then(() => sentAt.push(now))));
    const gaps = sentAt.slice(1).map((t, i) => t - (sentAt[i] as number));
    for (const g of gaps) {
      expect(g).toBeGreaterThanOrEqual(700);
      expect(g).toBeLessThanOrEqual(1600);
    }
    expect(new Set(gaps).size).toBeGreaterThan(4);
  });

  it("no waiting when the previous send was long ago", async () => {
    let now = 0;
    const sleep = vi.fn(async () => {});
    const pacer = new SendPacer({ now: () => now, sleep });
    await pacer.turn();
    now += 60_000;
    await pacer.turn();
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe("replyLikeHuman", () => {
  const fakeSock = () => {
    const calls: string[] = [];
    const sock = {
      readMessages: vi.fn(async () => void calls.push("read")),
      sendPresenceUpdate: vi.fn(async (s: string) => void calls.push(s)),
      sendMessage: vi.fn(async (_jid: string, c: { text: string }) => {
        calls.push(`send:${c.text}`);
        return { key: { id: "x" } };
      }),
    } as unknown as WASocket;
    return { sock, calls };
  };

  it("read → typing → (length-based wait) → paused → send", async () => {
    const { sock, calls } = fakeSock();
    const slept: number[] = [];
    const h = createHumanizer({
      enabled: true,
      rng: () => 0.5,
      sleep: async (ms) => void slept.push(ms),
      now: () => 0,
    });
    await replyLikeHuman(sock, "j", "hola", { read: { id: "in" }, h });
    expect(calls).toEqual(["read", "composing", "paused", "send:hola"]);
    expect(slept[0]).toBe(typingDelayMs("hola", () => 0.5));
  });

  it("a socket without presence/read support still answers; a failing presence never blocks", async () => {
    const send = vi.fn(async () => undefined);
    const h = createHumanizer({ enabled: true, rng: () => 0.5, sleep: async () => {}, now: () => 0 });
    await replyLikeHuman({ sendMessage: send } as never, "j", "hola", { h });
    const broken = {
      sendPresenceUpdate: vi.fn(async () => {
        throw new Error("offline");
      }),
      sendMessage: send,
    };
    await replyLikeHuman(broken as never, "j", "otra", { h });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("disabled (tests, SVA_HUMANIZE=0): no presence, no waits, first variant", async () => {
    const { sock, calls } = fakeSock();
    const h = createHumanizer({ enabled: false });
    await replyLikeHuman(sock, "j", "hola", { read: { id: "in" }, h });
    expect(calls).toEqual(["send:hola"]);
    expect(h.picker.pick("linkOk", "c", PHRASES.linkOk)).toBe(PHRASES.linkOk[0]);
    expect(h.picker.pick("linkOk", "c", PHRASES.linkOk)).toBe(PHRASES.linkOk[0]);
  });
});

describe("phrases", () => {
  it("every kind has 2+ different variants; placeholders are consistent within a kind", () => {
    for (const [kind, variants] of Object.entries(PHRASES)) {
      expect(variants.length, kind).toBeGreaterThanOrEqual(3);
      expect(new Set(variants).size, kind).toBe(variants.length);
      const holes = (v: string) =>
        [...v.matchAll(/\{(\w+)\}/g)]
          .map((m) => m[1])
          .sort()
          .join(",");
      for (const v of variants) expect(holes(v), `${kind}: ${v}`).toBe(holes(variants[0] as string));
    }
  });

  it("no invisible or control characters anywhere", () => {
    const all = [...Object.values(PHRASES).flat(), ...LINK_GREETINGS];
    const bad = (t: string) =>
      [...t].some((ch) => {
        const c = ch.codePointAt(0) ?? 0;
        return c < 32 || (c >= 0x200b && c <= 0x200f) || c === 0x2060 || c === 0xfeff;
      });
    for (const t of all) expect(bad(t), t).toBe(false);
  });
});

describe("link greeting (pre-typed message to link WhatsApp)", () => {
  it("varies between codes, stays stable for one code, and always carries a parseable code", () => {
    const codes = Array.from(
      { length: 200 },
      (_, i) =>
        `EST-${"ABCDEFGHJK"[i % 10]}${"MNPQRSTUVW"[(i * 7) % 10]}${"23456789"[i % 8]}${"XYZ2345"[(i * 3) % 7]}${"KMNP"[i % 4]}`,
    );
    const used = new Set(codes.map(linkGreeting));
    expect(new Set(codes.map((c) => linkGreeting(c).replace(c, "{code}"))).size).toBe(LINK_GREETINGS.length);
    expect(used.size).toBeGreaterThan(100);
    for (const c of codes) {
      expect(linkGreeting(c)).toBe(linkGreeting(c));
      expect(extractCode(linkGreeting(c))).toBe(c);
    }
  });
});
