import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const convertVideo = vi.fn();
vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      readonly code: string,
    ) {
      super(message);
    }
  },
  convertVideo: (...args: unknown[]) => convertVideo(...args),
}));

const { useConverterStore, selectBusy, selectResult } = await import(
  "../../web/src/features/converter/store/converterStore.js"
);
const { deriveSegment, rangeToSegment } = await import("../../web/src/features/converter/model/segment.js");
const { validateFile, validateAudioFile } = await import("../../web/src/features/converter/model/validation.js");
const { DEFAULT_OPTIONS } = await import("../../web/src/features/converter/model/defaults.js");

const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type });
const initial = useConverterStore.getState();

beforeEach(() => {
  useConverterStore.setState(initial, true);
  convertVideo.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("validation", () => {
  it("accepts video/image, rejects others and oversize", () => {
    expect(validateFile({ type: "video/mp4", size: 1 })).toBeNull();
    expect(validateFile({ type: "image/gif", size: 1 })).toBeNull();
    expect(validateFile({ type: "text/plain", size: 1 })).toMatch(/video, GIF o imagen/);
    expect(validateFile({ type: "video/mp4", size: 60 * 1024 * 1024 })).toMatch(/supera/);
    expect(validateAudioFile({ type: "audio/ogg", size: 1 })).toBeNull();
    expect(validateAudioFile({ type: "image/png", size: 1 })).toMatch(/audio o video/);
  });
});

describe("segment model", () => {
  it("video: clamps to what's left and flags clipping", () => {
    const s = deriveSegment({ ...DEFAULT_OPTIONS, startSec: 4, durationSec: 10 }, "video", 7);
    expect(s).toMatchObject({ known: true, remaining: 3, effective: 3, end: 7, clipped: true });
    expect(s.presets.at(-1)).toBe(180);
  });
  it("image: auto duration, 10 s presets, no slider", () => {
    const s = deriveSegment({ ...DEFAULT_OPTIONS, durationSec: undefined }, "image");
    expect(s).toMatchObject({ isImage: true, known: false, effective: undefined, maxDuration: 10 });
    expect(s.presets).toEqual([3, 5, 10]);
  });
  it("long clip → smoothness tiers", () => {
    expect(deriveSegment({ ...DEFAULT_OPTIONS, durationSec: 120 }, "video", 300).smoothness).toBe("slideshow");
    expect(deriveSegment({ ...DEFAULT_OPTIONS, durationSec: 120, hq: true }, "video", 300).smoothness).toBe("reduced");
  });
  it("range keeps the span within limits, moving the other thumb", () => {
    expect(rangeToSegment([10, 300], 10, 0.5, 180)).toEqual({ startSec: 120, durationSec: 180 }); // end dragged → start follows
    expect(rangeToSegment([5, 300], 10, 0.5, 180)).toEqual({ startSec: 5, durationSec: 180 }); // start dragged
    expect(rangeToSegment([4, 4.1], 4, 0.5, 180)).toEqual({ startSec: 4, durationSec: 0.5 });
  });
});

describe("converter store", () => {
  it("rejects invalid files without touching the selection", () => {
    const err = useConverterStore.getState().selectFile(file("a.txt", "text/plain"));
    expect(err).toBeTruthy();
    expect(useConverterStore.getState()).toMatchObject({ file: null, status: { kind: "error" } });
  });

  it("selecting a new file revokes the previous preview URL; image → auto duration", () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const s = useConverterStore.getState();
    s.selectFile(file("a.mp4", "video/mp4"));
    const first = useConverterStore.getState().previewUrl;
    expect(useConverterStore.getState()).toMatchObject({ inputKind: "video", status: { kind: "ready" } });
    expect(useConverterStore.getState().options.durationSec).toBe(5);

    s.selectFile(file("b.png", "image/png"));
    expect(revoke).toHaveBeenCalledWith(first);
    expect(useConverterStore.getState()).toMatchObject({ inputKind: "image" });
    expect(useConverterStore.getState().options.durationSec).toBeUndefined();
  });

  it("convert: no meme text → no overlay; text and voice are kept in the store", async () => {
    convertVideo.mockResolvedValue({ id: "r" });
    const s = useConverterStore.getState();
    s.selectFile(file("a.mp4", "video/mp4"));
    await s.convert();
    expect(convertVideo.mock.calls[0]?.[0]).toMatchObject({ overlay: null });
    s.updateText({ top: "hola" });
    s.updateOptions({ voice: "eco" });
    expect(useConverterStore.getState().text).toMatchObject({ top: "hola", bottom: "", caps: true });
    expect(useConverterStore.getState().options.voice).toBe("eco");
    s.updateText({ top: "" });
  });

  it("convert: uploading → processing → done (selectors follow)", async () => {
    const result = { id: "r1" };
    convertVideo.mockImplementation(async (_files, _opts, cb) => {
      cb.onUploadProgress(0.5);
      expect(selectBusy(useConverterStore.getState())).toBe(true);
      cb.onProcessing();
      expect(useConverterStore.getState().status.kind).toBe("processing");
      return result;
    });
    const s = useConverterStore.getState();
    s.selectFile(file("a.mp4", "video/mp4"));
    await s.convert();
    expect(selectResult(useConverterStore.getState())).toBe(result);
    expect(selectBusy(useConverterStore.getState())).toBe(false);
  });

  it("cancel aborts the request and returns to ready", async () => {
    let signal: AbortSignal | undefined;
    convertVideo.mockImplementation(
      (_f, _o, cb) =>
        new Promise((_res, rej) => {
          signal = cb.signal;
          cb.signal.addEventListener("abort", () => rej(Object.assign(new Error("Cancelado."), { code: "aborted" })));
        }),
    );
    const s = useConverterStore.getState();
    s.selectFile(file("a.mp4", "video/mp4"));
    const pending = s.convert();
    s.cancel();
    await pending.catch(() => {});
    expect(signal?.aborted).toBe(true);
    expect(useConverterStore.getState().status.kind).toBe("ready");
  });

  it("a late success after cancel is ignored", async () => {
    let resolve: (v: unknown) => void = () => {};
    convertVideo.mockImplementation(() => new Promise((r) => (resolve = r)));
    const s = useConverterStore.getState();
    s.selectFile(file("a.mp4", "video/mp4"));
    const pending = s.convert();
    s.cancel();
    resolve({ id: "late" });
    await pending;
    expect(useConverterStore.getState().status.kind).toBe("ready");
  });

  it("errors surface as a user message", async () => {
    convertVideo.mockRejectedValue(new Error("El inicio está fuera del video."));
    const s = useConverterStore.getState();
    s.selectFile(file("a.mp4", "video/mp4"));
    await s.convert();
    // The error card gets the message plus a code to explain it and offer a next step.
    expect(useConverterStore.getState().status).toEqual({
      kind: "error",
      error: { message: "El inicio está fuera del video.", code: "internal", status: 0 },
    });
  });
});
