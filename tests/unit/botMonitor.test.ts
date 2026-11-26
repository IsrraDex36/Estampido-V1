import { describe, expect, it } from "vitest";
import { BotMonitor } from "../../src/adapters/http/botMonitor.js";
import type { Alert } from "../../src/utils/alerts.js";

function setup(initial: { available: boolean; connected: boolean }) {
  let now = 0;
  let status = initial;
  let throws = false;
  const alerts: Alert[] = [];
  const m = new BotMonitor({
    status: async () => {
      if (throws) throw new Error("boom");
      return status;
    },
    alert: async (a) => {
      alerts.push(a);
    },
    now: () => now,
    graceMs: 5 * 60_000,
  });
  return {
    m,
    alerts,
    at: (min: number) => {
      now = min * 60_000;
    },
    set: (s: typeof status) => {
      status = s;
    },
    fail: (v: boolean) => {
      throws = v;
    },
  };
}

describe("bot monitor (web process)", () => {
  it("booting slowly is fine: no alert inside the grace period", async () => {
    const t = setup({ available: false, connected: false });
    t.at(4);
    expect(await t.m.tick()).toBe("unreachable");
    t.set({ available: true, connected: true });
    t.at(4.5);
    await t.m.tick();
    expect(t.alerts).toEqual([]);
  });

  it("bot process gone > 5 min → one critical alert (not one per minute), then «back» once", async () => {
    const t = setup({ available: true, connected: true });
    await t.m.tick();
    t.fail(true);
    for (let min = 1; min <= 12; min++) {
      t.at(min);
      await t.m.tick();
    }
    expect(t.alerts).toHaveLength(1);
    expect(t.alerts[0]).toMatchObject({ level: "critical" });
    expect(t.alerts[0]?.message).toMatch(/no responde desde hace 5 min/);
    t.fail(false);
    t.at(13);
    await t.m.tick();
    await t.m.tick();
    expect(t.alerts).toHaveLength(2);
    expect(t.alerts[1]).toMatchObject({ level: "recovered" });
    expect(t.alerts[1]?.message).toMatch(/~12 min/);
  });

  it("WhatsApp disconnected (e.g. logged out) gets its own advice: link it in /admin", async () => {
    const t = setup({ available: true, connected: true });
    await t.m.tick();
    t.set({ available: true, connected: false });
    t.at(1);
    await t.m.tick();
    t.at(7);
    await t.m.tick();
    expect(t.alerts[0]?.message).toMatch(/sin conexión con WhatsApp.*\/admin/);
  });

  it("a short blip (deploy/restart) never alerts", async () => {
    const t = setup({ available: true, connected: true });
    await t.m.tick();
    t.set({ available: false, connected: false });
    t.at(1);
    await t.m.tick();
    t.set({ available: true, connected: true });
    t.at(3);
    await t.m.tick();
    t.set({ available: false, connected: false });
    t.at(4);
    await t.m.tick();
    t.at(8); // only 4 min since the second drop
    await t.m.tick();
    expect(t.alerts).toEqual([]);
  });

  it("a failing alert channel never breaks the monitor", async () => {
    const m = new BotMonitor({
      status: async () => ({ available: false, connected: false }),
      alert: async () => {
        throw new Error("ntfy down");
      },
      now: () => 10 * 60_000,
      graceMs: 0,
    });
    await expect(m.tick()).resolves.toBe("unreachable");
  });
});
