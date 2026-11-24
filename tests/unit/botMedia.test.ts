import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WAMessage } from "baileys";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadLimited } from "../../src/adapters/bot/media.js";
import {
  PendingAudioStore,
  senderKey,
} from "../../src/adapters/bot/pending.js";
import { UserInputError } from "../../src/core/errors.js";

function fakeDownloader(chunks: number[]) {
  const destroy = vi.fn();
  const fn = vi.fn(async () => {
    async function* gen() {
      for (const n of chunks) yield Buffer.alloc(n);
    }
    return Object.assign(gen(), { destroy });
  });
  return { fn, destroy };
}

describe("downloadLimited", () => {
  it("rejects from declared fileLength without downloading", async () => {
    const { fn } = fakeDownloader([10]);
    await expect(
      downloadLimited({ fileLength: 2000 }, "video", 1000, "El video", fn),
    ).rejects.toThrow(/El video supera/);
    expect(fn).not.toHaveBeenCalled();
  });

  it("accepts Long-like fileLength", async () => {
    const { fn } = fakeDownloader([10]);
    await expect(
      downloadLimited(
        { fileLength: { toNumber: () => 5000 } },
        "video",
        1000,
        "X",
        fn,
      ),
    ).rejects.toBeInstanceOf(UserInputError);
  });

  it("aborts mid-stream when declared size lies", async () => {
    const { fn, destroy } = fakeDownloader([600, 600, 600]);
    await expect(
      downloadLimited({ fileLength: 10 }, "audio", 1000, "El audio", fn),
    ).rejects.toThrow(/supera/);
    expect(destroy).toHaveBeenCalled();
  });

  it("returns full buffer within limit", async () => {
    const { fn } = fakeDownloader([300, 300]);
    expect((await downloadLimited({}, "video", 1000, "X", fn)).length).toBe(
      600,
    );
  });
});

describe("PendingAudioStore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const job = async () => {
    const dir = await mkdtemp(join(tmpdir(), "sva-pend-"));
    return {
      dir,
      videoPath: join(dir, "input"),
      cmd: {
        startSec: 0,
        durationSec: 5,
        fit: "pad" as const,
        customAudio: true,
      },
      origin: { key: { id: "1" } } as WAMessage,
    };
  };

  it("take returns once and keeps files", async () => {
    const store = new PendingAudioStore(60_000);
    const j = await job();
    await store.set("k", j);
    expect(store.take("k")?.dir).toBe(j.dir);
    expect(store.take("k")).toBeUndefined();
    await expect(stat(j.dir)).resolves.toBeDefined();
  });

  it("discard and replace delete temp dirs", async () => {
    const store = new PendingAudioStore(60_000);
    const a = await job();
    const b = await job();
    await store.set("k", a);
    await store.set("k", b); // replaces a
    await expect(stat(a.dir)).rejects.toThrow();
    expect(await store.discard("k")).toBe(true);
    await expect(stat(b.dir)).rejects.toThrow();
    expect(await store.discard("k")).toBe(false);
  });

  it("expires, cleans up and notifies", async () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    const store = new PendingAudioStore(1000, onExpire);
    await store.set("chat|", await job());
    vi.advanceTimersByTime(1001);
    expect(onExpire).toHaveBeenCalledWith(
      "chat|",
      expect.objectContaining({ cmd: expect.any(Object) }),
    );
    expect(store.size).toBe(0);
  });

  it("senderKey separates group participants", () => {
    expect(
      senderKey({ remoteJid: "g@g.us", participant: "a@s.whatsapp.net" }),
    ).not.toBe(
      senderKey({ remoteJid: "g@g.us", participant: "b@s.whatsapp.net" }),
    );
  });
});
