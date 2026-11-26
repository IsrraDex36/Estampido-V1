import { describe, expect, it } from "vitest";
import { VOICE_EFFECTS as API_VOICES } from "../../src/adapters/http/contract.js";
import { pngSize } from "../../src/adapters/http/jobs/routes.js";
import { convertFieldsSchema } from "../../src/adapters/http/schema.js";
import { buildAudioArgs } from "../../src/core/audio/encodeAudio.js";
import { VOICE_EFFECTS, voiceFilters } from "../../src/core/audio/voice.js";
import { OVERLAY_OUT, overlayGraph } from "../../src/core/frame/overlay.js";
import { buildImageArgs } from "../../src/core/image/encodeImage.js";
import { buildVideoArgs } from "../../src/core/video/encodeVideo.js";

const af = (args: string[]) => args[args.indexOf("-af") + 1] ?? "";

describe("voice effects", () => {
  it("API list mirrors the core list", () => {
    expect([...API_VOICES]).toEqual([...VOICE_EFFECTS]);
  });

  it("pitch effects keep the length (rate × tempo = 1); none → no filters", () => {
    for (const v of ["ardilla", "monstruo"] as const) {
      const f = voiceFilters(v);
      const rate = Number(f.find((x) => x.startsWith("asetrate="))?.split("=")[1]) / 48_000;
      const tempo = Number(f.find((x) => x.startsWith("atempo="))?.split("=")[1]);
      expect(rate * tempo).toBeCloseTo(1, 3);
      expect(tempo).toBeGreaterThanOrEqual(0.5); // atempo's range
      expect(tempo).toBeLessThanOrEqual(2);
    }
    expect(voiceFilters("ardilla")[1]).toBe("asetrate=72000");
    expect(voiceFilters("monstruo")[1]).toBe("asetrate=33600");
    expect(voiceFilters("reversa")).toEqual(["areverse"]);
    expect(voiceFilters("eco")[0]).toMatch(/^aecho=/);
    expect(voiceFilters(undefined)).toEqual([]);
  });

  it("audio args: effect after the alignment, limiter when an effect or gain is on", () => {
    const base = { input: "in", output: "out.ogg", startSec: 0, durationSec: 3 };
    expect(af(buildAudioArgs(base))).toBe("aresample=async=1:first_pts=0");
    expect(af(buildAudioArgs({ ...base, voice: "reversa" }))).toBe(
      "aresample=async=1:first_pts=0,areverse,alimiter=limit=0.95",
    );
    expect(af(buildAudioArgs({ ...base, voice: "eco", gainDb: 6 }))).toMatch(
      /^aresample=async=1:first_pts=0,aecho=.*,volume=6\.0dB,alimiter=limit=0\.95$/,
    );
  });
});

describe("text overlay", () => {
  const base = { input: "in.mp4", output: "o.webp", startSec: 1, durationSec: 2 };

  it("no overlay → plain -vf, single input", () => {
    const a = buildVideoArgs(base);
    expect(a).toContain("-vf");
    expect(a.filter((x) => x === "-i")).toHaveLength(1);
  });

  it("input seek: trim before the media, overlay as 2nd input, filter_complex mapped", () => {
    const a = buildVideoArgs({ ...base, overlay: "ov.png" });
    expect(a.slice(4, 10)).toEqual(["-ss", "1", "-t", "2", "-i", "in.mp4"]);
    expect(a.slice(10, 12)).toEqual(["-i", "ov.png"]);
    expect(a).not.toContain("-vf");
    expect(a[a.indexOf("-map") + 1]).toBe(OVERLAY_OUT);
  });

  it("output seek (animated): trim after BOTH inputs so it doesn't hit the overlay", () => {
    const a = buildVideoArgs({ ...base, seek: "output", loop: true, overlay: "ov.png" });
    expect(a.slice(4, 12)).toEqual(["-i", "in.mp4", "-i", "ov.png", "-ss", "1", "-t", "2"]);
    expect(a[a.indexOf("-filter_complex") + 1]).toMatch(/^\[0:v\]loop=loop=-1/);
  });

  it("graph wraps chains with their own pads (blur background) and scales the overlay to the canvas", () => {
    const g = overlayGraph("fps=15,split[sva_c][sva_f];[sva_c]boxblur[sva_b];[sva_b][sva_f]overlay", 512);
    expect(g.split(";")).toHaveLength(5);
    expect(g).toContain("[1:v]scale=512:512");
    expect(g.endsWith(`format=rgba${OVERLAY_OUT}`)).toBe(true);
  });

  it("still images too", () => {
    const a = buildImageArgs({ input: "i.png", output: "o.webp", overlay: "ov.png" });
    expect(a.slice(4, 8)).toEqual(["-i", "i.png", "-i", "ov.png"]);
    expect(a).toContain("-filter_complex");
  });
});

describe("request fields", () => {
  it("voice: one of the effects, or nothing", () => {
    expect(convertFieldsSchema.parse({ voice: "eco" }).voice).toBe("eco");
    expect(convertFieldsSchema.parse({}).voice).toBeUndefined();
    expect(convertFieldsSchema.safeParse({ voice: "robot" }).success).toBe(false);
  });

  it("pngSize reads IHDR; anything else is rejected", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(png.buffer).setUint32(16, 512);
    new DataView(png.buffer).setUint32(20, 300);
    expect(pngSize(png)).toEqual({ width: 512, height: 300 });
    expect(pngSize(new TextEncoder().encode("GIF89a................................"))).toBeNull();
    expect(pngSize(png.slice(0, 20))).toBeNull();
    const zero = png.slice();
    new DataView(zero.buffer).setUint32(16, 0);
    expect(pngSize(zero)).toBeNull();
  });
});
