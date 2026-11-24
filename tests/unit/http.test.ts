import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/adapters/http/app.js";
import type { ConvertResponse } from "../../src/adapters/http/contract.js";
import { ResultStore } from "../../src/adapters/http/resultStore.js";
import type {
  ConvertOptions,
  ConvertResult,
} from "../../src/pipeline/convert.js";

let root: string;
let store: ResultStore;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "sva-http-"));
  store = new ResultStore(root, 60_000);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const fakeConvert = vi.fn(async (o: ConvertOptions): Promise<ConvertResult> => {
  const webpPath = join(o.outDir, "sticker.webp");
  await writeFile(webpPath, "RIFF");
  const audioPath =
    o.audio === "none" ? undefined : join(o.outDir, "sticker.ogg");
  if (audioPath) await writeFile(audioPath, "OggS");
  return {
    webpPath,
    audioPath,
    warnings: [],
    stats: {
      source: {
        durationSec: 8,
        width: 640,
        height: 360,
        fps: 30,
        hasAudio: true,
      },
      segment: { startSec: o.startSec ?? 0, durationSec: o.durationSec ?? 5 },
      sticker: {
        bytes: 4,
        withinLimit: true,
        maxBytes: 512000,
        quality: 75,
        fps: 15,
        frames: 75,
        durationMs: 5000,
        attempts: 1,
      },
      audio: audioPath ? { bytes: 4, codec: "opus" } : undefined,
      elapsedMs: 1,
    },
  };
});

function form(fields: Record<string, string>, file?: File): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  if (file) fd.set("video", file);
  return fd;
}
const video = () =>
  new File([new Uint8Array(10)], "clip.mp4", { type: "video/mp4" });

describe("POST /api/convert", () => {
  it("converts and returns servable URLs", async () => {
    const app = createApp({ store, convert: fakeConvert });
    const res = await app.request("/api/convert", {
      method: "POST",
      body: form(
        {
          startSec: "1.5",
          durationSec: "4",
          fit: "crop",
          includeAudio: "true",
        },
        video(),
      ),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ConvertResponse;
    expect(body.sticker.url).toBe(`/api/results/${body.id}/sticker.webp`);
    expect(body.audio?.url).toBe(`/api/results/${body.id}/sticker.ogg`);
    expect(fakeConvert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        startSec: 1.5,
        durationSec: 4,
        fit: "crop",
        audio: "source",
      }),
    );

    const file = await app.request(body.sticker.url);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/webp");
  });

  it("includeAudio=false → audio none", async () => {
    const app = createApp({ store, convert: fakeConvert });
    const res = await app.request("/api/convert", {
      method: "POST",
      body: form({ includeAudio: "false" }, video()),
    });
    expect(((await res.json()) as ConvertResponse).audio).toBeNull();
  });

  it("400 without file", async () => {
    const app = createApp({ store, convert: fakeConvert });
    const res = await app.request("/api/convert", {
      method: "POST",
      body: form({}),
    });
    expect(res.status).toBe(400);
  });

  it("415 for non-video", async () => {
    const app = createApp({ store, convert: fakeConvert });
    const res = await app.request("/api/convert", {
      method: "POST",
      body: form({}, new File(["x"], "a.txt", { type: "text/plain" })),
    });
    expect(res.status).toBe(415);
  });

  it("400 for duration over limit", async () => {
    const app = createApp({ store, convert: fakeConvert });
    const res = await app.request("/api/convert", {
      method: "POST",
      body: form({ durationSec: "30" }, video()),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/results", () => {
  it("rejects traversal and unknown files", async () => {
    const app = createApp({ store, convert: fakeConvert });
    for (const url of [
      "/api/results/..%2F..%2Fetc/passwd",
      "/api/results/00000000-0000-0000-0000-000000000000/input",
      "/api/results/not-a-uuid/sticker.webp",
    ]) {
      expect((await app.request(url)).status).toBe(404);
    }
  });
});

describe("ResultStore", () => {
  it("resolve only allows whitelisted files under valid ids", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(store.resolve(id, "sticker.webp")).toBe(
      join(root, id, "sticker.webp"),
    );
    expect(store.resolve(id, "input")).toBeNull();
    expect(store.resolve("../x", "sticker.webp")).toBeNull();
  });
  it("sweep removes expired dirs", async () => {
    const { dir } = await store.create();
    expect(await store.sweep(Date.now())).toBe(0);
    expect(await store.sweep(Date.now() + 120_000)).toBe(1);
    await expect(stat(dir)).rejects.toThrow();
  });
});
