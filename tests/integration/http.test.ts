import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/adapters/http/app.js";
import type { ConvertResponse } from "../../src/adapters/http/contract.js";
import { ResultStore } from "../../src/adapters/http/resultStore.js";
import { makePng, makeTempDir, makeTone, makeVideo } from "../helpers/fixtures.js";

let dir: string;
let inputPath: string;

beforeAll(async () => {
  dir = await makeTempDir();
  inputPath = await makeVideo(dir, "clip.mp4", { seconds: 6 });
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const noBot = {
  status: async () => ({ available: false, connected: false }),
  send: async () => ({ delivered: "sticker" as const }),
};

describe("HTTP end-to-end (real ffmpeg)", () => {
  it("upload → sticker + audio downloadable", async () => {
    const app = createApp({ store: new ResultStore(join(dir, "results")), bot: noBot });
    const fd = new FormData();
    fd.set("video", new File([await readFile(inputPath)], "clip.mp4", { type: "video/mp4" }));
    fd.set("startSec", "1");

    const res = await app.request("/api/convert", { method: "POST", body: fd });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ConvertResponse;
    expect(body.sticker.withinLimit).toBe(true);
    expect(body.audio).not.toBeNull();

    const webp = Buffer.from(await (await app.request(body.sticker.url)).arrayBuffer());
    expect(webp.toString("ascii", 8, 12)).toBe("WEBP");
    const ogg = Buffer.from(await (await app.request(body.audio?.url ?? "")).arrayBuffer());
    expect(ogg.toString("ascii", 0, 4)).toBe("OggS");
  });

  it("422 for corrupt video", async () => {
    const app = createApp({ store: new ResultStore(join(dir, "results")), bot: noBot });
    const fd = new FormData();
    fd.set("video", new File([new Uint8Array(100)], "bad.mp4", { type: "video/mp4" }));
    const res = await app.request("/api/convert", { method: "POST", body: fd });
    expect(res.status).toBe(422);
  });

  it("image + audio → static sticker; per-kind duration limits", async () => {
    const app = createApp({ store: new ResultStore(join(dir, "results")), bot: noBot });
    const png = await makePng(dir);
    const tone = await makeTone(dir, 12);
    const fd = new FormData();
    fd.set("media", new File([await readFile(png)], "a.png", { type: "image/png" }));
    fd.set("audio", new File([await readFile(tone)], "t.m4a", { type: "audio/mp4" }));
    const res = await app.request("/api/convert", { method: "POST", body: fd });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ConvertResponse;
    expect(body.kind).toBe("image");
    expect(body.sticker).toMatchObject({ animated: false, maxBytes: 100 * 1024, withinLimit: true });
    expect(body.audio?.durationSec).toBeCloseTo(10, 0);

    // Video clips now accept up to 10 s (experimental); 6 s source → clamped with a warning.
    const tooLong = new FormData();
    tooLong.set("media", new File([await readFile(inputPath)], "c.mp4", { type: "video/mp4" }));
    tooLong.set("durationSec", "10");
    const r2 = await app.request("/api/convert", { method: "POST", body: tooLong });
    expect(r2.status).toBe(200);
    const body2 = (await r2.json()) as ConvertResponse;
    expect(body2.warnings.join(" ")).toMatch(/recortada/);
    expect(body2.sticker.withinLimit).toBe(true);
  });
});
