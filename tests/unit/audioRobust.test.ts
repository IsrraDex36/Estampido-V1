import { describe, expect, it } from "vitest";
import { buildAudioArgs, parseVolumeDetect } from "../../src/core/audio/encodeAudio.js";
import { parseProbeOutput } from "../../src/core/probe/probe.js";
import { gainFor, SILENCE_DB } from "../../src/pipeline/shared.js";

describe("parseVolumeDetect", () => {
  it("reads max/mean", () => {
    const err =
      "[Parsed_volumedetect_0 @ 0x1] mean_volume: -27.0 dB\n[Parsed_volumedetect_0 @ 0x1] max_volume: -10.3 dB";
    expect(parseVolumeDetect(err)).toEqual({ maxVolumeDb: -10.3, meanVolumeDb: -27 });
  });
  it("handles -inf and missing (no samples)", () => {
    expect(parseVolumeDetect("max_volume: -inf dB").maxVolumeDb).toBe(Number.NEGATIVE_INFINITY);
    expect(parseVolumeDetect("nothing here")).toEqual({ maxVolumeDb: null, meanVolumeDb: null });
  });
});

describe("gainFor (peak normalization)", () => {
  it.each([
    [-0.5, 0],
    [-6, 0],
    [-18, 17],
    [-40, 20], // capped
  ])("peak %d dB → +%d dB", (peak, gain) => {
    expect(gainFor(peak)).toBe(gain);
  });
  it("silence threshold sits well above digital silence", () => {
    expect(SILENCE_DB).toBeGreaterThan(-91);
  });
});

describe("audio stream listing", () => {
  it("lists all audio streams, default-disposition first", () => {
    const info = parseProbeOutput(
      JSON.stringify({
        streams: [
          { index: 0, codec_type: "video", width: 10, height: 10 },
          { index: 1, codec_type: "audio", codec_name: "aac", disposition: { default: 0 }, duration: "8.0" },
          { index: 2, codec_type: "audio", codec_name: "aac", disposition: { default: 1 }, start_time: "0.5" },
        ],
        format: {},
      }),
    );
    expect(info.audioStreams.map((s) => s.index)).toEqual([2, 1]);
    expect(info.audioStreams[0]).toMatchObject({ isDefault: true, startSec: 0.5 });
    expect(info.audioStreams[1]).toMatchObject({ durationSec: 8 });
  });
});

describe("buildAudioArgs", () => {
  it("maps the chosen stream, aligns to segment start, applies gain + limiter", () => {
    const args = buildAudioArgs({ input: "i", output: "o", startSec: 0, durationSec: 5, streamIndex: 2, gainDb: 12 });
    expect(args[args.indexOf("-map") + 1]).toBe("0:2");
    const af = args[args.indexOf("-af") + 1];
    expect(af).toContain("aresample=async=1:first_pts=0");
    expect(af).toContain("volume=12.0dB");
    expect(af).toContain("alimiter");
  });
  it("no gain → no volume filter; default map", () => {
    const args = buildAudioArgs({ input: "i", output: "o", startSec: 0, durationSec: 5 });
    expect(args[args.indexOf("-map") + 1]).toBe("0:a:0");
    expect(args[args.indexOf("-af") + 1]).not.toContain("volume");
  });
});
