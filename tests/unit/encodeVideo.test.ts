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
