import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Settings edge cases people hit in the first minute: switching files of
 * different kinds, sound on/off with effects, framing leftovers, what gets
 * sent to the server, and what the result says was applied.
 */
const convertVideo = vi.fn();
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("../../web/src/lib/api.js")>()),
  convertVideo: (...args: unknown[]) => convertVideo(...args),
}));

const { useConverterStore } = await import("../../web/src/features/converter/store/converterStore.js");
const { formFor } = await import("../../web/src/lib/api.js");
const { DEFAULT_OPTIONS } = await import("../../web/src/features/converter/model/defaults.js");
const { deriveSegment } = await import("../../web/src/features/converter/model/segment.js");
const { API_LIMITS } = await import("../../src/adapters/http/contract.js");

const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type });
const initial = useConverterStore.getState();
const st = () => useConverterStore.getState();

beforeEach(() => {
  useConverterStore.setState(initial, true);
  convertVideo.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("switching files", () => {
  it("video → image → GIF: durations follow the kind; framing and start reset", () => {
    st().selectFile(file("a.mp4", "video/mp4"));
    st().updateOptions({ startSec: 7, durationSec: 30, fit: "crop", cropX: 0.1, cropY: 0.9, cropZoom: 2 });
    st().selectFile(file("b.png", "image/png"));
    expect(st().options).toMatchObject({
      startSec: 0,
      durationSec: undefined,
      cropX: undefined,
      cropY: undefined,
      cropZoom: undefined,
    });
    expect(st().options.fit).toBe("crop"); // the chosen look stays
    st().selectFile(file("c.gif", "image/gif"));
    expect(st().inputKind).toBe("gif");
    expect(st().options.durationSec).toBe(5);
  });

  it("a rejected file keeps the previous one and its settings", () => {
    st().selectFile(file("a.mp4", "video/mp4"));
    st().updateOptions({ durationSec: 8 });
    const err = st().selectFile(file("doc.pdf", "application/pdf"));
    expect(err).toBeTruthy();
    expect(st().file?.name).toBe("a.mp4");
    expect(st().options.durationSec).toBe(8);
  });

  it("text, voice, look and the open tab survive a file change (they're your style)", () => {
    st().selectFile(file("a.mp4", "video/mp4"));
    st().updateText({ top: "hola" });
    st().updateOptions({ voice: "robot", look: "retro", flip: true });
    st().setSettingsTab("text");
    st().selectFile(file("b.mp4", "video/mp4"));
    expect(st().text.top).toBe("hola");
    expect(st().options).toMatchObject({ voice: "robot", look: "retro", flip: true });
    expect(st().settingsTab).toBe("text");
  });
});

describe("sound", () => {
  it("choosing a sound turns sound on and resets its window; removing it keeps the setting", () => {
    st().selectFile(file("a.mp4", "video/mp4"));
    st().updateOptions({ includeAudio: false, audioStartSec: 4, audioDurationSec: 3 });
    expect(st().selectAudioFile(file("s.mp3", "audio/mpeg"))).toBeNull();
    expect(st().options).toMatchObject({ includeAudio: true, audioStartSec: 0, audioDurationSec: undefined });
    st().selectAudioFile(null);
    expect(st().audioFile).toBeNull();
    expect(st().options.includeAudio).toBe(true);
  });

  it("a bad sound file is refused without touching anything", () => {
    st().selectAudioFile(file("s.mp3", "audio/mpeg"));
    expect(st().selectAudioFile(file("x.pdf", "application/pdf"))).toBeTruthy();
    expect(st().audioFile?.name).toBe("s.mp3");
  });
});

describe("what goes to the server", () => {
  const media = file("a.mp4", "video/mp4");
  const audio = file("s.mp3", "audio/mpeg");
  const base = { ...DEFAULT_OPTIONS };

  it("defaults: only what's needed (no crop, no transparent background, no extras)", () => {
    const f = formFor({ media }, base);
    expect([...f.keys()].sort()).toEqual(
      ["audioStartSec", "durationSec", "fit", "includeAudio", "includeMetadata", "media", "startSec"].sort(),
    );
  });

  it("crop numbers only in crop mode, background only in pad mode with a color", () => {
    const crop = formFor({ media }, { ...base, fit: "crop", cropX: 0.123456, background: "#ff0000" });
    expect(crop.get("cropX")).toBe("0.1235");
    expect(crop.has("background")).toBe(false);
    const pad = formFor({ media }, { ...base, fit: "pad", cropX: 0.3, background: "#ff0000" });
    expect(pad.has("cropX")).toBe(false);
    expect(pad.get("background")).toBe("#ff0000");
  });

  it("sound off: no audio file, no voice, no audio length", () => {
    const f = formFor({ media, audio }, { ...base, includeAudio: false, voice: "eco", audioDurationSec: 3 });
    expect(f.has("audio")).toBe(false);
    expect(f.has("voice")).toBe(false);
    expect(f.has("audioDurationSec")).toBe(false);
    const on = formFor({ media, audio }, { ...base, voice: "eco", audioDurationSec: 3 });
    expect(on.get("voice")).toBe("eco");
    expect(on.get("audioDurationSec")).toBe("3");
  });

  it("text layer, look, mirror and HQ are sent; pack fields trimmed or omitted", () => {
    const overlay = new Blob([new Uint8Array(4)], { type: "image/png" });
    const f = formFor(
      { media, overlay },
      { ...base, look: "bn", flip: true, hq: true, packName: "  Mi pack  ", publisher: "   " },
    );
    expect(f.get("overlay")).toBeInstanceOf(File);
    expect(f.get("look")).toBe("bn");
    expect(f.get("flip")).toBe("true");
    expect(f.get("hq")).toBe("true");
    expect(f.get("packName")).toBe("Mi pack");
    expect(f.has("publisher")).toBe(false);
  });
});

describe("result summary", () => {
  it("records what was applied at convert time (voice only if there was sound)", async () => {
    convertVideo.mockResolvedValue({ id: "r", audio: null });
    st().selectFile(file("a.mp4", "video/mp4"));
    st().updateOptions({ voice: "radio", look: "vivo", flip: true });
    await st().convert();
    expect(st().resultApplied).toEqual({ text: false, voice: undefined, look: "vivo", flip: true });
    convertVideo.mockResolvedValue({ id: "r2", audio: { durationSec: 2 } });
    await st().convert();
    expect(st().resultApplied?.voice).toBe("radio");
    // Changing settings afterwards doesn't rewrite what the result says.
    st().updateOptions({ look: undefined });
    expect(st().resultApplied?.look).toBe("vivo");
  });
});

describe("length rules", () => {
  it("videos offer up to the experimental max; images stay within 10 s of sound", () => {
    const v = deriveSegment({ ...DEFAULT_OPTIONS }, "video", 300);
    expect(v.presets.at(-1)).toBe(API_LIMITS.maxDurationSec);
    expect(v.presets).toContain(10);
    const i = deriveSegment({ ...DEFAULT_OPTIONS, durationSec: undefined }, "image");
    expect(Math.max(...i.presets)).toBeLessThanOrEqual(API_LIMITS.maxImageAudioSec);
  });

  it("HQ never promises more than 1 MB", () => {
    expect(API_LIMITS.maxExperimentalKb).toBe(1024);
  });
});
