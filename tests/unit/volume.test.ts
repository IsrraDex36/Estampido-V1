import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WASocket } from "baileys";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHumanizer, SendPacer } from "../../src/adapters/bot/humanize.js";
import { StatusMessage } from "../../src/adapters/bot/status.js";
import { BotAgeStore, limitsFor, VolumeGovernor, WARMUP } from "../../src/adapters/bot/volume.js";

const MIN = 60_000;
const DAY = 86_400_000;

describe("warm-up schedule", () => {
  it("starts gentle and only ever grows", () => {
    expect(limitsFor(0)).toEqual({ perMinute: 6, perHour: 40 });
    expect(limitsFor(2)).toEqual(limitsFor(0));
    expect(limitsFor(3)).toEqual({ perMinute: 10, perHour: 90 });
    expect(limitsFor(400)).toEqual({ perMinute: 40, perHour: 600 });
    for (let i = 1; i < WARMUP.length; i++) {
      const [a, b] = [WARMUP[i - 1], WARMUP[i]] as const;
      expect(b?.perMinute).toBeGreaterThan(a?.perMinute ?? 0);
      expect(b?.perHour).toBeGreaterThan(a?.perHour ?? 0);
      expect(b?.fromDay).toBeGreaterThan(a?.fromDay ?? 0);
    }
  });
});

describe("VolumeGovernor", () => {
  it("counts sends per minute / hour / day and reports the warm-up day", () => {
    let now = 10 * DAY;
    const v = new VolumeGovernor(() => now);
    v.setFirstSeen(now - 4 * DAY);
    for (let i = 0; i < 5; i++) {
      v.record();
      now += 10_000;
    }
    now += 2 * MIN;
    v.record();
    expect(v.report()).toEqual({
      lastMinute: 1,
      lastHour: 6,
      last24h: 6,
      warmupDay: 4,
      limits: { perMinute: 10, perHour: 90 },
    });
    now += DAY;
    expect(v.report().last24h).toBe(0); // old ones pruned
  });

  it("pressure rises toward 1 at a limit; waitMs says when the next send fits", () => {
    let now = 0;
    const v = new VolumeGovernor(() => now);
    v.setFirstSeen(0); // day 0: 6/min
    expect(v.pressure()).toBe(0);
    expect(v.waitMs()).toBe(0);
    for (let i = 0; i < 6; i++) {
      v.record();
      now += 1_000;
    }
    expect(v.pressure()).toBe(1);
    // The first of the 6 (at t=0) leaves the minute window at t=60 001.
    expect(v.waitMs()).toBe(60_001 - now);
    now = 60_001;
    expect(v.waitMs()).toBe(0);
  });

  it("the hourly limit holds even when each minute is fine", () => {
    let now = 0;
    const v = new VolumeGovernor(() => now);
    v.setFirstSeen(0); // 40/h
    for (let i = 0; i < 40; i++) {
      v.record();
      now += 80_000; // < 1/min
    }
    expect(v.waitMs()).toBeGreaterThan(0);
    expect(v.report().lastHour).toBeLessThanOrEqual(45);
  });

  it("unknown number → treated as brand new (safest)", () => {
    expect(new VolumeGovernor(() => 0).limits()).toEqual(limitsFor(0));
    expect(new VolumeGovernor(() => 0).report().warmupDay).toBeNull();
  });
});

describe("SendPacer with the governor", () => {
  it("never exceeds the warm-up limits, even for a burst of 30 sends", async () => {
    let now = 0;
    const v = new VolumeGovernor(() => now);
    v.setFirstSeen(0); // 6/min
    const pacer = new SendPacer({
      minGapMs: 0,
      jitterMs: 0,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
      volume: v,
      rng: () => 0,
    });
    const times: number[] = [];
    for (let i = 0; i < 30; i++) {
      await pacer.turn();
      times.push(now);
    }
    for (let i = 0; i < times.length; i++) {
      const inMinute = times.filter((t) => t > (times[i] as number) - MIN && t <= (times[i] as number)).length;
      expect(inMinute).toBeLessThanOrEqual(6);
    }
  });

  it("gaps stretch as pressure rises", async () => {
    let now = 0;
    const v = new VolumeGovernor(() => now);
    v.setFirstSeen(-100 * DAY); // mature number: 40/min
    const pacer = new SendPacer({
      minGapMs: 1_000,
      jitterMs: 0,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
      volume: v,
      rng: () => 0,
    });
    const gaps: number[] = [];
    let prev = 0;
    for (let i = 0; i < 20; i++) {
      await pacer.turn();
      if (i > 0) gaps.push(now - prev);
      prev = now;
    }
    expect(gaps.at(-1)).toBeGreaterThan(gaps[0] as number);
  });
});

describe("BotAgeStore", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "sva-age-"));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("remembers the first time per number (0600), independent per number", async () => {
    let now = 1_000;
    const store = new BotAgeStore(join(dir, "bot-age.json"), () => now);
    expect(await store.firstSeen("522298732115")).toBe(1_000);
    now = 9_999;
    expect(await store.firstSeen("522298732115")).toBe(1_000); // not reset by restarts
    expect(await store.firstSeen("5215500000000")).toBe(9_999); // another number: its own clock
    expect((await stat(join(dir, "bot-age.json"))).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(join(dir, "bot-age.json"), "utf8"))).toEqual({
      "522298732115": 1_000,
      "5215500000000": 9_999,
    });
  });
});

describe("StatusMessage: fewer, calmer edits", () => {
  const fake = () => {
    const sent: { text: string; edit: boolean }[] = [];
    const sock = {
      sendMessage: vi.fn(async (_j: string, c: { text: string; edit?: unknown }) => {
        sent.push({ text: c.text, edit: Boolean(c.edit) });
        return { key: { id: `k${sent.length}` } };
      }),
    } as unknown as WASocket;
    return { sock, sent };
  };
  const origin = { key: { id: "in", remoteJid: "chat@s.whatsapp.net" } } as never;

  it("quick successive updates collapse into the newest; edits keep a minimum gap", async () => {
    let now = 0;
    const h = createHumanizer({
      enabled: true,
      rng: () => 0,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
    });
    const { sock, sent } = fake();
    const s = new StatusMessage(sock, origin, h);
    await s.set("⏳ Descargando…");
    const t0 = now;
    void s.set("🕒 En cola · posición 2");
    void s.set("🕒 En cola · eres el siguiente");
    await s.set("⚙️ Creando tu sticker…");
    // Only the first message + ONE edit with the newest text, after the gap.
    expect(sent.map((x) => x.text)).toEqual(["⏳ Descargando…", "⚙️ Creando tu sticker…"]);
    expect(sent[1]?.edit).toBe(true);
    expect(now - t0).toBeGreaterThanOrEqual(h.editGapMs);
  });

  it("under load, non-essential updates are skipped; the final one always arrives", async () => {
    let now = 0;
    const v = new VolumeGovernor(() => now);
    v.setFirstSeen(0);
    for (let i = 0; i < 5; i++) v.record(); // 5 of 6 per minute → pressure 0.83
    const h = createHumanizer({
      enabled: true,
      rng: () => 0,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
      volume: v,
    });
    const { sock, sent } = fake();
    const s = new StatusMessage(sock, origin, h);
    await s.set("⏳ Descargando…");
    await s.set("🕒 En cola · posición 3", { essential: false });
    await s.set("✅ Listo");
    expect(sent.map((x) => x.text)).toEqual(["⏳ Descargando…", "✅ Listo"]);
  });

  it("the very first message is never skipped, even if marked non-essential", async () => {
    const h = createHumanizer({ enabled: true, rng: () => 0, now: () => 0, sleep: async () => {} });
    for (let i = 0; i < 6; i++) h.volume.record();
    const { sock, sent } = fake();
    await new StatusMessage(sock, origin, h).set("🕒 En cola", { essential: false });
    expect(sent).toHaveLength(1);
  });
});
