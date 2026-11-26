import { describe, expect, it } from "vitest";
import { AVG_SEND_SEC, estimatePackSec, etaLabel, remainingSec } from "../../web/src/features/social/packEta.js";

const fresh = { perMinute: 6, perHour: 40, lastMinute: 0, lastHour: 0 }; // day 0 of a new number
const mature = { perMinute: 40, perHour: 600, lastMinute: 0, lastHour: 0 };

describe("pack send time", () => {
  it("a mature number: just the human pace", () => {
    expect(estimatePackSec(10, mature)).toBe(Math.round(10 * AVG_SEND_SEC));
    expect(estimatePackSec(0, mature)).toBe(0);
  });

  it("a new number: 30 stickers at 6/min take minutes, not seconds", () => {
    expect(estimatePackSec(30, fresh)).toBe(4 * 60); // 6 now, 24 more at 6/min
    // already busy this minute → one more minute
    expect(estimatePackSec(30, { ...fresh, lastMinute: 6 })).toBe(5 * 60);
  });

  it("the hourly cap dominates when the hour is almost used up", () => {
    const sec = estimatePackSec(30, { ...fresh, lastHour: 35 });
    expect(sec).toBe(Math.round((25 / 40) * 3600)); // ~37 min
    expect(etaLabel(sec)).toBe("~38 min");
  });

  it("without pace info: the plain estimate", () => {
    expect(estimatePackSec(5)).toBe(8);
  });

  it("while sending, the measured pace wins after two", () => {
    expect(remainingSec(0, 30, 0, 240)).toBe(240);
    expect(remainingSec(1, 30, 5_000, 240)).toBe(232);
    expect(remainingSec(10, 30, 100_000, 240)).toBe(200); // 10 s each, 20 left
    expect(remainingSec(30, 30, 1, 240)).toBe(0);
  });

  it("labels read naturally", () => {
    expect(etaLabel(5)).toBe("unos segundos");
    expect(etaLabel(44)).toBe("~40 s");
    expect(etaLabel(240)).toBe("~4 min");
    expect(etaLabel(4200)).toBe("~1 h 10 min");
    expect(etaLabel(3600)).toBe("~1 h");
  });
});
