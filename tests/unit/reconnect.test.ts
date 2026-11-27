import { describe, expect, it } from "vitest";
import { reconnectDelay } from "../../src/adapters/bot/connection.js";

describe("bot reconnection never hammers WhatsApp", () => {
  it("403 (number restricted): 15 min, then 30, then capped at 60", () => {
    expect(reconnectDelay(403, 1)).toBe(15 * 60_000);
    expect(reconnectDelay(403, 2)).toBe(30 * 60_000);
    expect(reconnectDelay(403, 3)).toBe(60 * 60_000);
    expect(reconnectDelay(403, 50)).toBe(60 * 60_000);
  });

  it("other closes: exponential from ~2 s up to 5 min, with jitter", () => {
    const mid = () => 0.5;
    expect(reconnectDelay(428, 1, mid)).toBe(2_000);
    expect(reconnectDelay(428, 2, mid)).toBe(4_000);
    expect(reconnectDelay(undefined, 10, mid)).toBe(5 * 60_000);
    expect(reconnectDelay(500, 30, mid)).toBe(5 * 60_000);
    expect(reconnectDelay(428, 1, () => 0)).toBe(1_600); // -20 %
    expect(reconnectDelay(428, 1, () => 1)).toBe(2_400); // +20 %
  });

  it("a flood like the one seen in production (one attempt every 2 s) can't happen anymore", () => {
    // 60 consecutive 403s: total waiting is many hours, not 2 minutes.
    let total = 0;
    for (let n = 1; n <= 60; n++) total += reconnectDelay(403, n);
    expect(total).toBeGreaterThan(24 * 60 * 60_000);
  });
});
