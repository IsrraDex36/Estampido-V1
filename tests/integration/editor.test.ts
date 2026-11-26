import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/adapters/http/app.js";
import { type ConvertResponse, VOICE_EFFECTS } from "../../src/adapters/http/contract.js";
import { ResultStore } from "../../src/adapters/http/resultStore.js";
import { probe } from "../../src/core/probe/probe.js";
import { ffmpegPath, run } from "../../src/utils/ffmpeg.js";
import { firstFramePixel, makePng, makeTempDir, makeVideo } from "../helpers/fixtures.js";

let dir: string;
let clip: Buffer;
let overlay: Buffer;
const noBot = {
  status: async () => ({ available: false, connected: false }),
  send: async () => ({ delivered: "sticker" as const }),
};

beforeAll(async () => {
  dir = await makeTempDir();
  clip = await readFile(await makeVideo(dir, "clip.mp4", { seconds: 4 }));
  // Meme-text stand-in: transparent 512² with an opaque white band at the bottom.
  const ov = join(dir, "ov.png");
  await run(ffmpegPath(), [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=black@0:s=512x512,format=rgba,drawbox=x=0:y=420:w=512:h=80:color=white@1:t=fill:replace=1",
    "-frames:v",
    "1",
    "-update",
    "1",
    ov,
  ]);
  overlay = await readFile(ov);
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function convert(fields: Record<string, string>, files: Record<string, File> = {}) {
  const app = createApp({ store: new ResultStore(join(dir, "results")), bot: noBot });
  const fd = new FormData();
  fd.set("media", new File([clip], "clip.mp4", { type: "video/mp4" }));
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  for (const [k, v] of Object.entries(files)) fd.set(k, v);
  const res = await app.request("/api/convert", { method: "POST", body: fd });
  return { app, res };
}

const pngFile = (b: Buffer = overlay) => new File([b], "texto.png", { type: "image/png" });

describe("editor (real ffmpeg)", () => {
  it("text overlay is burnt into the sticker; the rest of the picture is untouched", async () => {
    const { app, res } = await convert({ durationSec: "2" }, { overlay: pngFile() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ConvertResponse;
    const webp = join(dir, "ov.webp");
    await writeFile(webp, Buffer.from(await (await app.request(body.sticker.url)).arrayBuffer()));
    const band = await firstFramePixel(webp, 256, 460);
    expect(band.slice(0, 3).every((c) => c > 235)).toBe(true); // white text band
    expect(band[3]).toBeGreaterThan(240);
    const top = await firstFramePixel(webp, 256, 10);
    expect(top[3]).toBeLessThan(20); // still the transparent pad bar above the 16:9 video
  });

  it("works with still images and crop framing", async () => {
    const app = createApp({ store: new ResultStore(join(dir, "results")), bot: noBot });
    const fd = new FormData();
    fd.set("media", new File([await readFile(await makePng(dir))], "i.png", { type: "image/png" }));
    fd.set("fit", "crop");
    fd.set("overlay", pngFile());
    const res = await app.request("/api/convert", { method: "POST", body: fd });
    expect(res.status).toBe(200);
  });

  it("black & white look and mirror reach the sticker", async () => {
    const pixel = async (fields: Record<string, string>, x: number) => {
      const { app, res } = await convert({ durationSec: "1", fit: "crop", ...fields });
      expect(res.status).toBe(200);
      const body = (await res.json()) as ConvertResponse;
      const file = join(dir, `px-${Object.values(fields).join("-") || "plain"}.webp`);
      await writeFile(file, Buffer.from(await (await app.request(body.sticker.url)).arrayBuffer()));
      return firstFramePixel(file, x, 256);
    };
    const [r, g, b] = await pixel({ look: "bn" }, 256);
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(12); // gray
    // testsrc2's left and right edges differ: mirrored, the left becomes the old right.
    const plainRight = await pixel({}, 500);
    const flippedLeft = await pixel({ flip: "true" }, 12);
    expect(
      flippedLeft
        .slice(0, 3)
        .map((c, i) => Math.abs(c - (plainRight[i] ?? 0)))
        .every((d) => d < 40),
    ).toBe(true);
  });

  it.each([...VOICE_EFFECTS])("voice «%s» keeps the sound's length", async (voice) => {
    const { app, res } = await convert({ durationSec: "2", voice });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ConvertResponse;
    expect(body.audio).not.toBeNull();
    const ogg = join(dir, `${voice}.ogg`);
    await writeFile(ogg, Buffer.from(await (await app.request(body.audio?.url ?? "")).arrayBuffer()));
    const info = await probe(ogg);
    expect(info.durationSec).toBeGreaterThan(1.85);
    expect(info.durationSec).toBeLessThan(2.2);
  });

  it("rejects a fake/huge overlay and an unknown voice (400/413, nothing converted)", async () => {
    const fake = await convert(
      {},
      { overlay: new File([Buffer.from("GIF89a not a png at all......")], "x.png", { type: "image/png" }) },
    );
    expect(fake.res.status).toBe(400);
    expect(await fake.res.json()).toMatchObject({ error: { code: "bad_options" } });
    const huge = await convert(
      {},
      { overlay: new File([new Uint8Array(2 * 1024 * 1024 + 1)], "x.png", { type: "image/png" }) },
    );
    expect(huge.res.status).toBe(413);
    const bad = await convert({ voice: "dragon" });
    expect(bad.res.status).toBe(400);
  });

  it("an empty overlay field is ignored; a voice without sound is a no-op", async () => {
    const { res } = await convert({ includeAudio: "false", voice: "eco" }, { overlay: new File([], "x.png") });
    expect(res.status).toBe(200);
    expect(((await res.json()) as ConvertResponse).audio).toBeNull();
  });
});
