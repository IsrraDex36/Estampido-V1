import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deviceListed, fanOut, webhookRequest } from "../../src/adapters/bot/alerts.js";
import { type Alert, type ProbeResult, Watchdog, type WatchdogConfig } from "../../src/adapters/bot/watchdog.js";

const MIN = 60_000;

function setup(cfg: Partial<WatchdogConfig> = {}, probe: () => Promise<ProbeResult> = async () => "present") {
  let t = 0;
  const alerts: Alert[] = [];
  const reconnect = vi.fn();
  const relink = vi.fn();
  const w = new Watchdog(
    { now: () => t, probe: vi.fn(probe), reconnect, relink, alert: (a) => void alerts.push(a) },
    { probeTimeoutMs: 1_000, ...cfg },
  );
  const at = async (ms: number) => {
    t = ms;
    await w.tick();
  };
  return { w, alerts, reconnect, relink, at, set: (ms: number) => (t = ms) };
}

beforeEach(() => vi.useRealTimers());
afterEach(() => vi.useRealTimers());

describe("watchdog", () => {
  it("healthy: probes every 5 min, status ok, no alerts", async () => {
    const s = setup();
    s.w.connectionChanged(true);
    for (let m = 1; m <= 30; m++) await s.at(m * MIN);
    expect(s.w.health()).toMatchObject({ status: "ok", connected: true, problems: [] });
    expect(s.w.health().lastProbeOkAt).toBe(30 * MIN);
    expect(s.alerts).toEqual([]);
  });

  it("closed > 3 min → down + one alert (cooldown), > 10 min → forced reconnect once; recovery announced", async () => {
    const s = setup();
    s.w.connectionChanged(true);
    s.set(MIN);
    s.w.connectionChanged(false);
    await s.at(2 * MIN);
    expect(s.w.health().status).toBe("degraded"); // a short blip isn't «down»
    await s.at(5 * MIN);
    await s.at(6 * MIN);
    expect(s.w.health().status).toBe("down");
    expect(s.alerts.filter((a) => a.kind === "down")).toHaveLength(1);
    await s.at(12 * MIN);
    await s.at(13 * MIN);
    expect(s.reconnect).toHaveBeenCalledTimes(1);
    s.set(14 * MIN);
    s.w.connectionChanged(true);
    expect(s.alerts.at(-1)).toMatchObject({ level: "recovered" });
    expect(s.w.health().status).toBe("ok");
  });

  it("device missing twice (default): critical alert + degraded, but the session is NEVER wiped; clears when present", async () => {
    const answers: ProbeResult[] = ["missing", "missing", "present"];
    const s = setup({}, async () => answers.shift() ?? "present");
    s.w.connectionChanged(true);
    await s.at(5 * MIN);
    await s.at(10 * MIN);
    expect(s.relink).not.toHaveBeenCalled();
    expect(s.w.health().status).toBe("degraded");
    expect(s.w.health().problems.join(" ")).toMatch(/no lista este dispositivo/);
    expect(s.alerts.find((a) => a.kind === "unlinked")?.level).toBe("critical");
    await s.at(15 * MIN);
    expect(s.w.health().status).toBe("ok");
  });

  it("autoRelink (opt-in): missing twice in a row → relink (one 'missing' alone does nothing)", async () => {
    const answers: ProbeResult[] = ["missing", "present", "missing", "missing"];
    const s = setup({ autoRelink: true }, async () => answers.shift() ?? "present");
    s.w.connectionChanged(true);
    await s.at(5 * MIN);
    await s.at(10 * MIN);
    await s.at(15 * MIN);
    expect(s.relink).not.toHaveBeenCalled();
    await s.at(20 * MIN);
    expect(s.relink).toHaveBeenCalledTimes(1);
    expect(s.w.health().status).toBe("unlinked");
    expect(s.alerts.find((a) => a.kind === "unlinked")?.level).toBe("critical");
  });

  it("'unknown' answers never trigger a relink", async () => {
    const s = setup({}, async () => "unknown");
    s.w.connectionChanged(true);
    for (let m = 5; m <= 60; m += 5) await s.at(m * MIN);
    expect(s.relink).not.toHaveBeenCalled();
    expect(s.w.health().status).toBe("ok");
  });

  it("probe unanswered 3 times → warn + reconnect; degraded meanwhile", async () => {
    const s = setup({}, () => Promise.reject(new Error("timeout")));
    s.w.connectionChanged(true);
    await s.at(5 * MIN);
    expect(s.w.health().status).toBe("degraded");
    await s.at(10 * MIN);
    expect(s.reconnect).not.toHaveBeenCalled();
    await s.at(15 * MIN);
    expect(s.reconnect).toHaveBeenCalledTimes(1);
    expect(s.alerts.find((a) => a.kind === "probe")?.level).toBe("warn");
  });

  it("a hanging probe times out (counts as unanswered)", async () => {
    vi.useFakeTimers();
    const s = setup({}, () => new Promise(() => {}));
    s.w.connectionChanged(true);
    s.set(5 * MIN);
    const tick = s.w.tick();
    await vi.advanceTimersByTimeAsync(1_500);
    await tick;
    expect(s.w.health().probeFailures).toBe(1);
  });

  it("decrypt failures ≥ 5 in an hour → degraded + one warn; they age out", async () => {
    const s = setup();
    s.w.connectionChanged(true);
    for (let i = 0; i < 5; i++) s.w.decryptFailure();
    expect(s.w.health()).toMatchObject({ status: "degraded", decryptFailuresRecent: 5 });
    expect(s.alerts.filter((a) => a.kind === "decrypt")).toHaveLength(1);
    await s.at(61 * MIN);
    expect(s.w.health().status).toBe("ok");
  });

  it("markUnlinked (phone logged the bot out) → unlinked + critical", () => {
    const s = setup();
    s.w.connectionChanged(true);
    s.w.markUnlinked("cerrada desde el teléfono");
    expect(s.w.health().status).toBe("unlinked");
    expect(s.alerts[0]).toMatchObject({ level: "critical", kind: "unlinked" });
  });

  it("a failing alert sink never breaks the watchdog", async () => {
    let t = 0;
    const w = new Watchdog({
      now: () => t,
      probe: async () => "present",
      reconnect: () => {},
      relink: () => {},
      alert: () => Promise.reject(new Error("sink down")),
    });
    w.connectionChanged(true);
    w.markUnlinked("x");
    t = 5 * MIN;
    await expect(w.tick()).resolves.toBeUndefined();
  });
});

describe("alerts", () => {
  const a: Alert = { level: "critical", kind: "down", message: "🔴 caído" };
  it("ntfy: plain text + priority/tags headers; Discord: content; generic: JSON", () => {
    expect(webhookRequest("https://ntfy.sh/estampido-x", a)).toMatchObject({
      body: "🔴 caído",
      headers: { Title: "Estampido", Priority: "high" },
    });
    expect(JSON.parse(webhookRequest("https://discord.com/api/webhooks/1/x", a).body)).toEqual({
      content: "**Estampido** · 🔴 caído",
    });
    expect(JSON.parse(webhookRequest("https://example.com/hook", a, new Date(0)).body)).toEqual({
      level: "critical",
      kind: "down",
      message: "🔴 caído",
      at: "1970-01-01T00:00:00.000Z",
    });
  });

  it("fanOut: one failing sink doesn't stop the others", async () => {
    const ok = vi.fn(async () => {});
    await fanOut(() => Promise.reject(new Error("x")), ok)(a);
    expect(ok).toHaveBeenCalledWith(a);
  });

  it("deviceListed reads the USync answer", () => {
    expect(deviceListed({ deviceList: [{ id: 0 }, { id: 8 }] }, 8)).toBe("present");
    expect(deviceListed({ deviceList: [{ id: 0 }, { id: 3 }] }, 8)).toBe("missing");
    expect(deviceListed({ deviceList: [] }, 8)).toBe("unknown");
    expect(deviceListed(undefined, 8)).toBe("unknown");
  });
});
