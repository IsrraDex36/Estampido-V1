import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/adapters/http/app.js";
import type { ConvertResponse } from "../../src/adapters/http/contract.js";
import { ResultStore } from "../../src/adapters/http/resultStore.js";
import { makeTempDir, makeVideo } from "../helpers/fixtures.js";

let dir: string;
let videoPath: string;

beforeAll(async () => {
  dir = await makeTempDir();
  videoPath = await makeVideo(dir, "clip.mp4", { seconds: 6 });
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("HTTP end-to-end (real ffmpeg)", () => {
  it("upload → sticker + audio downloadable", async () => {
    const app = createApp({ store: new ResultStore(join(dir, "results")) });
    const fd = new FormData();
    fd.set("video", new File([await readFile(videoPath)], "clip.mp4", { type: "video/mp4" }));
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
    const app = createApp({ store: new ResultStore(join(dir, "results")) });
    const fd = new FormData();
    fd.set("video", new File([new Uint8Array(100)], "bad.mp4", { type: "video/mp4" }));
    const res = await app.request("/api/convert", { method: "POST", body: fd });
    expect(res.status).toBe(422);
  });
});
