import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const convertVideo = vi.fn();
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("../../web/src/lib/api.js")>()),
  convertVideo: (...args: unknown[]) => convertVideo(...args),
}));

const { useConverterStore, MAX_BATCH } = await import("../../web/src/features/converter/store/converterStore.js");
const { publishMany } = await import("../../web/src/features/collection/publishMany.js");
const { ApiError } = await import("../../web/src/lib/api.js");

const file = (name: string, type = "video/mp4") => new File([new Uint8Array(10)], name, { type });
const initial = useConverterStore.getState();
const st = () => useConverterStore.getState();
const until = async (cond: () => boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 20));
  }
};

beforeEach(() => {
  useConverterStore.setState(initial, true);
  convertVideo.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("several files at once (owner's batch)", () => {
  it("first becomes the clip, the rest wait; never more than 5 in total; bad files skipped", () => {
    const files = ["a", "b", "c", "d", "e", "f", "g"].map((n) => file(`${n}.mp4`));
    expect(st().selectFiles(files)).toBe(2); // 6th and 7th refused
    expect(st().file?.name).toBe("a.mp4");
    expect(st().queued.map((f) => f.name)).toEqual(["b.mp4", "c.mp4", "d.mp4", "e.mp4"]);
    expect(MAX_BATCH).toBe(5);

    expect(st().selectFiles([file("x.pdf", "application/pdf"), file("y.mp4")])).toBe(1);
    expect(st().file?.name).toBe("y.mp4");
    expect(st().queued).toEqual([]);
  });

  it("after each sticker the next file converts by itself with the same settings", async () => {
    let n = 0;
    convertVideo.mockImplementation(async (files: { media: File }, opts: { voice?: string }) => ({
      id: `r${++n}-${files.media.name}-${opts.voice}`,
    }));
    st().selectFiles([file("a.mp4"), file("b.mp4"), file("c.mp4")]);
    st().updateOptions({ voice: "eco" });
    await st().convert();
    await until(() => convertVideo.mock.calls.length === 3 && st().status.kind === "done");
    expect(convertVideo.mock.calls.map((c) => (c[0] as { media: File }).media.name)).toEqual([
      "a.mp4",
      "b.mp4",
      "c.mp4",
    ]);
    expect(convertVideo.mock.calls.every((c) => (c[1] as { voice?: string }).voice === "eco")).toBe(true);
    expect(st().queued).toEqual([]);
  });

  it("a failure stops the batch (the rest keep waiting); removing the clip clears the line", async () => {
    convertVideo.mockRejectedValueOnce(new Error("falló"));
    st().selectFiles([file("a.mp4"), file("b.mp4")]);
    await st().convert();
    await new Promise((r) => setTimeout(r, 900));
    expect(convertVideo).toHaveBeenCalledTimes(1);
    expect(st().queued.map((f) => f.name)).toEqual(["b.mp4"]);
    st().selectFile(null);
    expect(st().queued).toEqual([]);
  });
});

describe("publish several from the collection", () => {
  const items = ["r1", "r2", "r3"].map((id) => ({
    id,
    stickerUrl: "",
    audioUrl: null,
    animated: true,
    createdAt: 0,
    expiresAt: 0,
  }));
  const req = { category: "memes" as const, tags: ["risa"], ownsAudio: true };

  it("one after another, same category/tags for all, progress reported", async () => {
    const publish = vi.fn(async () => ({}) as never);
    const progress: number[] = [];
    const r = await publishMany(items, req, publish, (d) => progress.push(d));
    expect(r).toEqual({ published: 3, failed: 0 });
    expect(publish.mock.calls.map((c) => (c[0] as { resultId: string }).resultId)).toEqual(["r1", "r2", "r3"]);
    expect(publish.mock.calls[0]?.[0]).toMatchObject({
      category: "memes",
      tags: ["risa"],
      ownsAudio: true,
      share: "both",
    });
    expect(progress).toEqual([1, 2, 3]);
  });

  it("an expired one is skipped; a limit or sign-in problem stops (it would repeat)", async () => {
    const expired = vi.fn(async (q: { resultId: string }) => {
      if (q.resultId === "r2") throw new ApiError("Expiró", "expired", 404);
      return {} as never;
    });
    expect(await publishMany(items, req, expired, () => {})).toEqual({ published: 2, failed: 1 });
    const limited = vi.fn(async () => {
      throw new ApiError("Demasiadas publicaciones", "rate_limited", 429);
    });
    const r = await publishMany(items, req, limited, () => {});
    expect(r).toMatchObject({ published: 0, failed: 1, stopped: "Demasiadas publicaciones" });
    expect(limited).toHaveBeenCalledTimes(1);
  });
});
