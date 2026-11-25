import { describe, expect, it } from "vitest";
import * as server from "../../src/utils/time.js";
import * as web from "../../web/src/lib/time.js";

describe("server/web time helpers stay identical", () => {
  it.each(["90", "1:30", "1:30.5", "0:01:30", "1,5", "1:60", "abc", ""])("parseTime(%j)", (s) => {
    expect(server.parseTime(s)).toBe(web.parseTime(s));
  });
  it.each([0, 5, 90.5, 180, 3725])("formatTime(%d)", (n) => {
    expect(server.formatTime(n)).toBe(web.formatTime(n));
  });
});
