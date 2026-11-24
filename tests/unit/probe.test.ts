import { describe, expect, it } from "vitest";
import { parseFrameRate, parseProbeOutput } from "../../src/core/probe/probe.js";

describe("parseFrameRate", () => {
  it.each([
    ["30/1", 30],
    ["30000/1001", 30000 / 1001],
    ["0/0", 0],
    [undefined, 0],
    ["25", 25],
  ])("%s → %d", (input, expected) => {
    expect(parseFrameRate(input)).toBeCloseTo(expected);
  });
});

describe("parseProbeOutput", () => {
  it("swaps dims for 90° rotated video", () => {
    const info = parseProbeOutput(
      JSON.stringify({
        streams: [
          {
            codec_type: "video",
            codec_name: "h264",
            width: 1920,
            height: 1080,
            avg_frame_rate: "30/1",
            side_data_list: [{ rotation: -90 }],
          },
        ],
        format: { duration: "4.5" },
      }),
    );
    expect(info).toMatchObject({
      width: 1080,
      height: 1920,
      fps: 30,
      durationSec: 4.5,
      hasAudio: false,
    });
  });

  it("detects audio stream", () => {
    const info = parseProbeOutput(
      JSON.stringify({
        streams: [
          { codec_type: "video", width: 10, height: 10 },
          { codec_type: "audio", codec_name: "aac" },
        ],
        format: {},
      }),
    );
    expect(info.hasAudio).toBe(true);
    expect(info.audioCodec).toBe("aac");
  });
});
