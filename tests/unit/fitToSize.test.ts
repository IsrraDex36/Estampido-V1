import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type EncodeAttempt, fitToSize, LONG_LADDER, ladderFor } from "../../src/core/optimize/fitToSize.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sva-fit-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const ladder: EncodeAttempt[] = [
  { quality: 80, fps: 15 },
  { quality: 50, fps: 12 },
  { quality: 20, fps: 10 },
];

/** Fake encoder: size proportional to quality. */
const fakeEncode = (out: string) => async (a: EncodeAttempt) => writeFile(out, Buffer.alloc(a.quality * 10));

describe("fitToSize", () => {
  it("stops at first step that fits", async () => {
    const out = join(dir, "x.webp");
    const r = await fitToSize(fakeEncode(out), out, 600, ladder);
    expect(r).toMatchObject({
      quality: 50,
      fps: 12,
      bytes: 500,
      withinLimit: true,
      attempts: 2,
    });
  });
  it("returns smallest with withinLimit=false when nothing fits", async () => {
    const out = join(dir, "x.webp");
    const r = await fitToSize(fakeEncode(out), out, 100, ladder);
    expect(r).toMatchObject({
      quality: 20,
      withinLimit: false,
      attempts: 2, // middle step skipped (estimated 640 B > 2×100 B budget)
      bytes: 200,
    });
  });
  it("first step fits → single attempt", async () => {
    const out = join(dir, "x.webp");
    expect((await fitToSize(fakeEncode(out), out, 10_000, ladder)).attempts).toBe(1);
  });

  it("long ladder: skips steps that obviously cannot fit, always tries the last", async () => {
    const out = join(dir, "x.webp");
    const encoded: number[] = [];
    const enc = async (a: EncodeAttempt) => {
      encoded.push(a.fps);
      await writeFile(out, Buffer.alloc(Math.round(a.fps * 100 * 1024))); // 100 KB per fps
    };
    const r = await fitToSize(enc, out, 150 * 1024, LONG_LADDER);
    expect(r.withinLimit).toBe(true);
    expect(r.fps).toBe(1);
    expect(encoded.length).toBeLessThan(LONG_LADDER.length / 2);
    expect(ladderFor(180)).toBe(LONG_LADDER);
    expect(ladderFor(5)).not.toBe(LONG_LADDER);
  });
});
