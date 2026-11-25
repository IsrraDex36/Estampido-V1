import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/adapters/http/app.js";
import { ResultStore } from "../../src/adapters/http/resultStore.js";
import { CancelledError } from "../../src/core/errors.js";
import { ffmpegPath, run } from "../../src/utils/ffmpeg.js";
import { Semaphore } from "../../src/utils/semaphore.js";

describe("run() cancellation", () => {
  it("kills a running ffmpeg promptly and rejects with CancelledError", async () => {
    const controller = new AbortController();
    // -re: real-time, so this would take 60 s if not killed.
    const pending = run(
      ffmpegPath(),
      ["-v", "error", "-re", "-f", "lavfi", "-i", "testsrc2=duration=60", "-f", "null", "-"],
      { signal: controller.signal },
    );
    const t0 = Date.now();
    setTimeout(() => controller.abort(), 300);
    await expect(pending).rejects.toBeInstanceOf(CancelledError);
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  it("rejects immediately when already aborted (nothing spawned)", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(run(ffmpegPath(), ["-version"], { signal: controller.signal })).rejects.toBeInstanceOf(CancelledError);
  });
});

describe("Semaphore", () => {
  it("reports queue position and lets a cancelled waiter leave without running", async () => {
    const sem = new Semaphore(1);
    let release: () => void = () => {};
    const first = sem.run(() => new Promise<void>((r) => (release = r)));
    const positions: number[] = [];
    const controller = new AbortController();
    const ran = vi.fn();
    const second = sem.run(async () => ran(), { signal: controller.signal, onQueued: (p) => positions.push(p) });
    expect(positions).toEqual([1]);
    expect(sem.pending).toBe(1);
    controller.abort();
    await expect(second).rejects.toBeInstanceOf(CancelledError);
    expect(sem.pending).toBe(0);
    release();
    await first;
    expect(ran).not.toHaveBeenCalled();
    // slot is free again
    await expect(sem.run(async () => 42)).resolves.toBe(42);
  });
});

describe("HTTP: client disconnect cancels the job", () => {
  it("convert sees an aborted signal; job dir removed; 499", async () => {
    const root = await mkdtemp(join(tmpdir(), "sva-cancel-"));
    try {
      let seen: AbortSignal | undefined;
      const convert = vi.fn(async (o: { signal?: AbortSignal }) => {
        seen = o.signal;
        await new Promise((_r, reject) => o.signal?.addEventListener("abort", () => reject(new CancelledError())));
        throw new Error("unreachable");
      });
      const app = createApp({
        store: new ResultStore(root),
        convert: convert as never,
        bot: {
          status: async () => ({ available: false, connected: false }),
          send: async () => ({ delivered: "sticker" }),
        },
      });
      const fd = new FormData();
      fd.set("media", new File([new Uint8Array(10)], "a.mp4", { type: "video/mp4" }));
      const client = new AbortController();
      const req = new Request("http://x/api/convert", { method: "POST", body: fd, signal: client.signal });
      const pending = app.fetch(req);
      await vi.waitFor(() => expect(convert).toHaveBeenCalled());
      client.abort();
      const res = await pending;
      expect(seen?.aborted).toBe(true);
      expect(res.status).toBe(499);
      expect(await readdir(root)).toEqual([]); // job folder cleaned up
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
