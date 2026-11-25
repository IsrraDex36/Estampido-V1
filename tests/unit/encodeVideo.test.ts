import { describe, expect, it } from "vitest";
import { buildVideoArgs, buildVideoFilter } from "../../src/core/video/encodeVideo.js";

describe("buildVideoFilter", () => {
  it("pads with transparent color", () => {
    const f = buildVideoFilter("pad", 15, 512);
    expect(f).toContain("force_original_aspect_ratio=decrease");
    expect(f).toContain("pad=512:512");
    expect(f).toContain("color=0x00000000");
    expect(f.indexOf("format=rgba")).toBeLessThan(f.indexOf("pad="));
  });
  it("pads with a solid color background", () => {
    const f = buildVideoFilter("pad", 15, 512, "#ff3366");
    expect(f).toContain("pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0xff3366FF");
  });
  it("pads with a blurred copy of the frame (single in/out chain)", () => {
    const f = buildVideoFilter("pad", 15, 512, "blur");
    expect(f.startsWith("fps=15,split[")).toBe(true);
    expect(f).toContain("boxblur=");
    expect(f).toContain("overlay=(W-w)/2:(H-h)/2,format=rgba");
    expect(f).not.toContain("pad=");
  });
  it("ignores the background when cropping", () => {
    expect(buildVideoFilter("crop", 15, 512, "blur")).toBe(buildVideoFilter("crop", 15, 512));
  });
  it("crops to fill", () => {
    const f = buildVideoFilter("crop", 15, 512);
    expect(f).toContain("force_original_aspect_ratio=increase");
    expect(f).toContain("crop=512:512");
  });
});

describe("buildVideoArgs", () => {
  it("uses libwebp_anim, cfr, infinite loop, no audio", () => {
    const args = buildVideoArgs({
      input: "in.mp4",
      output: "out.webp",
      startSec: 1,
      durationSec: 5,
    });
    const argAfter = (flag: string) => args[args.indexOf(flag) + 1];
    expect(argAfter("-c:v")).toBe("libwebp_anim");
    expect(argAfter("-fps_mode")).toBe("cfr");
    expect(argAfter("-loop")).toBe("0");
    expect(argAfter("-ss")).toBe("1");
    expect(argAfter("-t")).toBe("5");
    expect(args).toContain("-an");
    expect(args.at(-1)).toBe("out.webp");
  });

  it("seek: output puts -ss/-t after -i (animated WebP inputs)", () => {
    const args = buildVideoArgs({ input: "a.webp", output: "o.webp", startSec: 0, durationSec: 2, seek: "output" });
    expect(args.indexOf("-i")).toBeLessThan(args.indexOf("-ss"));
    const def = buildVideoArgs({ input: "a.mp4", output: "o.webp", startSec: 0, durationSec: 2 });
    expect(def.indexOf("-ss")).toBeLessThan(def.indexOf("-i"));
  });
});

describe("long-clip encoder settings", async () => {
  const { buildAudioArgs } = await import("../../src/core/audio/encodeAudio.js");
  const { encodeTimeoutMs } = await import("../../src/core/video/encodeVideo.js");
  it("audio: 48 kbps short, 32 kbps constrained VBR long", () => {
    const short = buildAudioArgs({ input: "i", output: "o", startSec: 0, durationSec: 5 });
    expect(short[short.indexOf("-b:a") + 1]).toBe("48k");
    expect(short).not.toContain("-vbr");
    const long = buildAudioArgs({ input: "i", output: "o", startSec: 0, durationSec: 180 });
    expect(long[long.indexOf("-b:a") + 1]).toBe("32k");
    expect(long[long.indexOf("-vbr") + 1]).toBe("constrained");
  });
  it("timeouts scale with duration", () => {
    expect(encodeTimeoutMs(5)).toBe(120_000);
    expect(encodeTimeoutMs(180)).toBe(540_000);
  });
});
