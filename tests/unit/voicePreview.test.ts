import { describe, expect, it } from "vitest";
import {
  PREVIEW_MAX_SEC,
  previewWindow,
  reverseChannels,
} from "../../web/src/features/converter/model/voicePreview.js";

const base = { startSec: 2, durationSec: 5, audioStartSec: 1, audioDurationSec: undefined };

describe("voice preview window", () => {
  it("video without a chosen sound: its own sound, same stretch as the sticker", () => {
    expect(previewWindow({ ...base, kind: "video", hasAudioFile: false })).toEqual({
      from: "media",
      start: 2,
      duration: 5,
    });
  });

  it("a chosen sound wins, from its own start", () => {
    expect(previewWindow({ ...base, kind: "image", hasAudioFile: true, audioDurationSec: 3 })).toEqual({
      from: "audio",
      start: 1,
      duration: 3,
    });
  });

  it("GIFs and images without a sound have nothing to preview", () => {
    expect(previewWindow({ ...base, kind: "gif", hasAudioFile: false })).toBeNull();
    expect(previewWindow({ ...base, kind: "image", hasAudioFile: false })).toBeNull();
    expect(previewWindow({ ...base, kind: null, hasAudioFile: false })).toBeNull();
  });

  it("long clips preview only the first seconds", () => {
    expect(previewWindow({ ...base, kind: "video", hasAudioFile: false, durationSec: 120 })?.duration).toBe(
      PREVIEW_MAX_SEC,
    );
    expect(previewWindow({ ...base, kind: "video", hasAudioFile: false, durationSec: undefined })?.duration).toBe(
      PREVIEW_MAX_SEC,
    );
  });

  it("«reversa» flips every channel", () => {
    const l = new Float32Array([1, 2, 3]);
    const r = new Float32Array([4, 5]);
    reverseChannels([l, r]);
    expect([...l]).toEqual([3, 2, 1]);
    expect([...r]).toEqual([5, 4]);
  });
});
