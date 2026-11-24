import { describe, expect, it } from "vitest";
import { inspectWebp } from "../../src/core/webp/inspect.js";

describe("inspectWebp", () => {
  it("rejects non-webp", () => {
    expect(() => inspectWebp(Buffer.from("not a webp file"))).toThrow(
      /Not a WebP/,
    );
  });
});
