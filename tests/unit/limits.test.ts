import { describe, expect, it } from "vitest";
import { API_LIMITS } from "../../src/adapters/http/contract.js";
import { INPUT_LIMITS, STICKER_LIMITS } from "../../src/config/limits.js";

describe("limits", () => {
  it("HTTP contract mirrors shared input limits", () => {
    expect(API_LIMITS.maxUploadBytes).toBe(INPUT_LIMITS.maxVideoBytes);
    expect(API_LIMITS.maxAudioBytes).toBe(INPUT_LIMITS.maxAudioBytes);
    expect(API_LIMITS.maxDurationSec).toBe(STICKER_LIMITS.maxDurationSec);
    expect(API_LIMITS.maxImageAudioSec).toBe(STICKER_LIMITS.maxImageAudioSec);
    expect(API_LIMITS.maxExperimentalKb * 1024).toBe(STICKER_LIMITS.experimentalMaxBytes);
  });
});
