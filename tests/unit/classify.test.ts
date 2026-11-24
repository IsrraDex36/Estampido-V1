import { describe, expect, it } from "vitest";
import { classifyMedia, parseProbeOutput } from "../../src/core/probe/probe.js";

describe("classifyMedia", () => {
  it.each([
    [{ videoCodec: "h264", formatName: "mov,mp4,m4a,3gp,3g2,mj2" }, "video"],
    [{ videoCodec: "gif", formatName: "gif" }, "animated"],
    [{ videoCodec: "webp_anim", formatName: "webp_anim" }, "animated"],
    [{ videoCodec: "apng", formatName: "apng" }, "animated"],
    [{ videoCodec: "png", formatName: "png_pipe" }, "image"],
    [{ videoCodec: "mjpeg", formatName: "image2" }, "image"],
    [{ videoCodec: "webp", formatName: "webp_pipe" }, "image"],
  ] as const)("%o → %s", (info, kind) => {
    expect(classifyMedia(info)).toBe(kind);
  });
});

describe("parseProbeOutput", () => {
  it("ignores cover art (attached_pic) in audio files", () => {
    const info = parseProbeOutput(
      JSON.stringify({
        streams: [
          { codec_type: "audio", codec_name: "mp3" },
          { codec_type: "video", codec_name: "mjpeg", width: 500, height: 500, disposition: { attached_pic: 1 } },
        ],
        format: { format_name: "mp3", duration: "12.0" },
      }),
    );
    expect(info).toMatchObject({ hasVideo: false, hasAudio: true, formatName: "mp3" });
  });
});
