import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PackSummary } from "../../src/adapters/http/contract.js";
import { seoHead } from "../../src/adapters/http/seo.js";
import { OG_H, OG_W, ogArgs, ogLayout } from "../../src/adapters/http/social/og.js";
import { probe } from "../../src/core/probe/probe.js";
import { type Harness, makeHarness } from "../helpers/apiHarness.js";
import { firstFramePixel, makeTempDir } from "../helpers/fixtures.js";

describe("share-preview layout (pure)", () => {
  it("1–4 tiles centered inside 1200×630, never overlapping", () => {
    for (let n = 1; n <= 6; n++) {
      const { size, xs, y } = ogLayout(n);
      expect(xs).toHaveLength(Math.min(4, n));
      expect(xs[0]).toBeGreaterThan(0);
      expect((xs.at(-1) ?? 0) + size).toBeLessThan(OG_W);
      expect(y + size).toBeLessThan(OG_H);
      for (let i = 1; i < xs.length; i++) expect((xs[i] ?? 0) - (xs[i - 1] ?? 0)).toBeGreaterThan(size);
      // centered: equal margins
      expect(Math.abs((xs[0] ?? 0) - (OG_W - ((xs.at(-1) ?? 0) + size)))).toBeLessThanOrEqual(1);
    }
  });

  it("uses at most 4 stickers and maps the last overlay", () => {
    const args = ogArgs(["a", "b", "c", "d", "e"], "out.png");
    expect(args.filter((a) => a === "-i")).toHaveLength(5); // background + 4
    expect(args[args.indexOf("-map") + 1]).toBe("[bg4]");
  });

  it("pages can carry their own preview image and alt text", () => {
    const head = seoHead("https://x.test", "/p/abc", undefined, {
      title: "Pack",
      description: "d",
      image: "/api/og/pack/abc.png?v=1",
      imageAlt: "Stickers del pack",
    });
    expect(head).toContain('property="og:image" content="https://x.test/api/og/pack/abc.png?v=1"');
    expect(head).toContain('content="Stickers del pack"');
    expect(seoHead("https://x.test", "/")).toContain("https://x.test/og-image.png");
  });
});

let dir: string;
let h: Harness;
beforeEach(async () => {
  dir = await makeTempDir();
  h = await makeHarness(dir);
});
afterEach(async () => {
  h.close();
  await rm(dir, { recursive: true, force: true });
});

describe("share-preview images (real ffmpeg)", () => {
  it("a pack's card is a 1200×630 PNG with its stickers; cached; empty/unknown → site image", async () => {
    await h.signIn("ana", "ana");
    const a = await h.publish("ana", { title: "Uno" });
    const b = await h.publish("ana", { title: "Dos" });
    const pack = await h.json<PackSummary>(
      h.req("ana", "/api/me/packs", { method: "POST", body: JSON.stringify({ name: "Mi pack", stickerId: a.id }) }),
    );
    await h.req("ana", `/api/me/packs/${pack.id}/stickers/${b.id}`, { method: "PUT" });

    const res = await h.anonymous(`/api/og/pack/${pack.id}.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const file = join(dir, "card.png");
    await writeFile(file, new Uint8Array(await res.arrayBuffer()));
    const info = await probe(file);
    expect([info.width, info.height]).toEqual([OG_W, OG_H]);
    // A tile holds the (red) sticker; the corner is the dark background.
    const { size, xs, y } = ogLayout(2);
    const [r, g] = await firstFramePixel(file, (xs[0] ?? 0) + size / 2, y + size / 2, OG_W);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(60);
    expect((await firstFramePixel(file, 5, 5, OG_W)).slice(0, 3).every((c) => c < 40)).toBe(true);

    const again = await h.anonymous(`/api/og/pack/${pack.id}.png`);
    expect(again.status).toBe(200);

    const empty = await h.json<PackSummary>(
      h.req("ana", "/api/me/packs", { method: "POST", body: JSON.stringify({ name: "Vacío" }) }),
    );
    const e = await h.anonymous(`/api/og/pack/${empty.id}.png`);
    expect(e.status).toBe(302);
    expect(e.headers.get("location")).toBe("/og-image.png");
    expect((await h.anonymous("/api/og/pack/no-existe.png")).status).toBe(302);
  });

  it("creator card from their stickers; banned or unknown → site image", async () => {
    await h.signIn("ana", "ana");
    await h.publish("ana");
    expect((await h.anonymous("/api/og/creator/ana.png")).status).toBe(200);
    expect((await h.anonymous("/api/og/creator/nadie.png")).status).toBe(302);
    await h.admin("/api/admin/users/ana/ban", { method: "POST" });
    expect((await h.anonymous("/api/og/creator/ana.png")).status).toBe(302);
  });
});
