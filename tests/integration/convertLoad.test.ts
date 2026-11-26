import { readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/adapters/http/app.js";
import type { ConvertJobAccepted, ConvertJobStatus, QueueInfo } from "../../src/adapters/http/contract.js";
import { ResultStore } from "../../src/adapters/http/resultStore.js";
import { CancelledError, UserInputError } from "../../src/core/errors.js";
import type { ConvertOptions, ConvertResult } from "../../src/pipeline/convert.js";
import { makeTempDir } from "../helpers/fixtures.js";

/**
 * Many people creating stickers at once, through the real HTTP API and queue
 * (with a stand-in converter that takes a controllable time and records how
 * many run in parallel).
 */
let dir: string;
let store: ResultStore;
/** Apps made by a test: before cleaning up, wait until none has work in flight. */
const live: ReturnType<typeof createApp>[] = [];
beforeEach(async () => {
  dir = await makeTempDir();
  store = new ResultStore(join(dir, "results"), 60_000);
});
afterEach(async () => {
  for (const app of live.splice(0)) {
    for (let i = 0; i < 400; i++) {
      const q = (await (await app.request("/api/queue")).json()) as QueueInfo;
      if (q.active === 0 && q.waiting === 0) break;
      await sleep(15);
    }
  }
  await sleep(20); // let the last job finish writing its files
  await rm(dir, { recursive: true, force: true });
});

const track = (app: ReturnType<typeof createApp>) => {
  live.push(app);
  return app;
};
const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Stand-in converter: takes `ms`, honors cancellation, tracks parallelism. */
function slowConvert(ms: number, behavior: (o: ConvertOptions) => void = () => {}) {
  const stats = { running: 0, peak: 0, done: 0 };
  const convert = async (o: ConvertOptions): Promise<ConvertResult> => {
    stats.running++;
    stats.peak = Math.max(stats.peak, stats.running);
    try {
      behavior(o);
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, ms);
        o.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new CancelledError());
        });
      });
      const webpPath = join(o.outDir, "sticker.webp");
      await writeFile(webpPath, "RIFF");
      stats.done++;
      return {
        kind: "video",
        webpPath,
        warnings: [],
        stats: {
          source: { durationSec: 5, width: 64, height: 64, fps: 15, hasAudio: false },
          segment: { startSec: 0, durationSec: 5 },
          sticker: {
            animated: true,
            bytes: 4,
            withinLimit: true,
            maxBytes: 512000,
            quality: 75,
            fps: 15,
            frames: 75,
            durationMs: 5000,
            attempts: 1,
            metadata: null,
          },
          audio: undefined,
          elapsedMs: ms,
        },
      } as ConvertResult;
    } finally {
      stats.running--;
    }
  };
  return { convert, stats };
}

const upload = (app: ReturnType<typeof createApp>, client: number, async = true) => {
  const fd = new FormData();
  fd.set("media", new File([new Uint8Array(2048)], "clip.mp4", { type: "video/mp4" }));
  fd.set("durationSec", "5");
  return app.request(`/api/convert${async ? "?async=1" : ""}`, {
    method: "POST",
    body: fd,
    headers: { "x-estampido-client": uuid(client) },
  });
};
const status = async (app: ReturnType<typeof createApp>, client: number, jobId: string) =>
  (await (
    await app.request(`/api/jobs/${jobId}`, { headers: { "x-estampido-client": uuid(client) } })
  ).json()) as ConvertJobStatus;

async function waitFinal(app: ReturnType<typeof createApp>, client: number, jobId: string, timeoutMs = 10_000) {
  const t0 = Date.now();
  for (;;) {
    const s = await status(app, client, jobId);
    if (s.state === "done" || s.state === "failed" || s.state === "cancelled") return s;
    if (Date.now() - t0 > timeoutMs) throw new Error(`job ${jobId} never finished: ${JSON.stringify(s)}`);
    await sleep(15);
  }
}

describe("burst: 40 people press «Crear» at once", () => {
  it("bounded admission, never more than 2 converting, everyone accepted finishes, the rest told when to retry", async () => {
    const { convert, stats } = slowConvert(60);
    const app = track(createApp({ store, convert, maxConcurrent: 2, maxQueue: 6, maxWaitSec: 999 }));
    const responses = await Promise.all(Array.from({ length: 40 }, (_, i) => upload(app, i)));
    const accepted = responses.map((r, i) => ({ r, i })).filter(({ r }) => r.status === 202);
    const refused = responses.filter((r) => r.status === 503);
    expect(accepted.length + refused.length).toBe(40); // nothing else (no 500s, no hangs)
    expect(accepted.length).toBe(8); // 2 running + 6 in line
    for (const r of refused) {
      expect(Number(r.headers.get("retry-after"))).toBeGreaterThanOrEqual(5);
      expect(await r.json()).toMatchObject({ error: { code: "busy", retryAfterSec: expect.any(Number) } });
    }
    const jobs = await Promise.all(
      accepted.map(async ({ r, i }) => ({ i, body: (await r.json()) as ConvertJobAccepted })),
    );
    // Positions are 0 (starting) for the first two, then 1..6.
    expect(jobs.map((j) => j.body.position).sort((a, b) => a - b)).toEqual([0, 0, 1, 2, 3, 4, 5, 6]);
    const finals = await Promise.all(jobs.map((j) => waitFinal(app, j.i, j.body.jobId)));
    expect(finals.every((f) => f.state === "done")).toBe(true);
    expect(stats.peak).toBe(2);
    expect(stats.done).toBe(8);
    const q = (await (await app.request("/api/queue")).json()) as QueueInfo;
    expect(q).toMatchObject({ active: 0, waiting: 0, full: false });
  });

  it("the API stays responsive while the queue is full", async () => {
    const { convert } = slowConvert(300);
    const app = track(createApp({ store, convert, maxConcurrent: 2, maxQueue: 10, maxWaitSec: 999 }));
    const uploads = Array.from({ length: 12 }, (_, i) => upload(app, i));
    await Promise.all(uploads);
    const t = performance.now();
    for (let i = 0; i < 20; i++) expect((await app.request("/api/health")).status).toBe(200);
    expect((performance.now() - t) / 20).toBeLessThan(20);
    const q = (await (await app.request("/api/queue")).json()) as QueueInfo;
    expect(q.active).toBe(2);
    expect(q.waiting).toBe(10);
    expect(q.full).toBe(true);
    expect(q.etaSec).toBeGreaterThan(0);
  });

  it("waves of traffic: as the line drains, new people get in (no starvation, no leaks)", async () => {
    const { convert, stats } = slowConvert(25);
    const app = track(createApp({ store, convert, maxConcurrent: 2, maxQueue: 4, maxWaitSec: 999 }));
    let next = 0;
    const done: Promise<unknown>[] = [];
    for (let wave = 0; wave < 6; wave++) {
      const rs = await Promise.all(Array.from({ length: 10 }, () => upload(app, next++)));
      rs.forEach((r, k) => {
        if (r.status === 202) {
          const client = next - 10 + k;
          done.push(r.json().then((b) => waitFinal(app, client, (b as ConvertJobAccepted).jobId)));
        }
      });
      await sleep(120);
    }
    await Promise.all(done);
    expect(stats.peak).toBeLessThanOrEqual(2);
    expect(stats.done).toBe(done.length);
    expect(done.length).toBeGreaterThanOrEqual(6 * 6 - 6); // each wave gets ~6 places
    expect((await (await app.request("/api/queue")).json()) as QueueInfo).toMatchObject({ active: 0, waiting: 0 });
  });
});

describe("fairness and lifecycle", () => {
  it("one sticker at a time per browser (429 + Retry-After), free again when it ends", async () => {
    const { convert } = slowConvert(80);
    const app = track(createApp({ store, convert, maxConcurrent: 2, maxQueue: 6 }));
    const first = await upload(app, 1);
    expect(first.status).toBe(202);
    const second = await upload(app, 1);
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBeTruthy();
    expect(await second.json()).toMatchObject({ error: { code: "one_at_a_time" } });
    await waitFinal(app, 1, ((await first.json()) as ConvertJobAccepted).jobId);
    expect((await upload(app, 1)).status).toBe(202);
  });

  it("cancel a waiting job: its place frees, its files are removed", async () => {
    const { convert, stats } = slowConvert(200);
    const app = track(createApp({ store, convert, maxConcurrent: 1, maxQueue: 4 }));
    await upload(app, 1);
    const waiting = (await (await upload(app, 2)).json()) as ConvertJobAccepted;
    expect(waiting.position).toBe(1);
    expect((await status(app, 2, waiting.jobId)).state).toBe("queued");
    const del = await app.request(`/api/jobs/${waiting.jobId}`, {
      method: "DELETE",
      headers: { "x-estampido-client": uuid(2) },
    });
    expect(del.status).toBe(200);
    expect(await waitFinal(app, 2, waiting.jobId)).toEqual({ state: "cancelled" });
    await sleep(250);
    expect(stats.done).toBe(1); // the cancelled one never ran
    expect((await upload(app, 2)).status).toBe(202); // can try again right away
  });

  it("a job past the time limit fails with «timeout» (504) and frees its slot", async () => {
    const { convert } = slowConvert(5_000);
    const app = track(createApp({ store, convert, maxConcurrent: 1, maxQueue: 2, jobTimeoutSec: 0.1 }));
    const a = (await (await upload(app, 1)).json()) as ConvertJobAccepted;
    const final = await waitFinal(app, 1, a.jobId);
    expect(final).toMatchObject({ state: "failed", error: { code: "timeout", status: 504 } });
    expect((await upload(app, 2)).status).toBe(202);
  });

  it("conversion errors become clear failures; jobs are private; unknown jobs 404", async () => {
    const { convert } = slowConvert(1, () => {
      throw new UserInputError("El archivo no tiene video.");
    });
    const app = track(createApp({ store, convert, maxConcurrent: 1, maxQueue: 2 }));
    const a = (await (await upload(app, 1)).json()) as ConvertJobAccepted;
    expect(await waitFinal(app, 1, a.jobId)).toMatchObject({
      state: "failed",
      error: { code: "unprocessable", status: 422, message: "El archivo no tiene video." },
    });
    const other = await app.request(`/api/jobs/${a.jobId}`, { headers: { "x-estampido-client": uuid(9) } });
    expect(other.status).toBe(404);
    expect(await other.json()).toMatchObject({ error: { code: "expired" } });
    // Failed jobs leave nothing on disk.
    expect(await readdir(join(dir, "results")).catch(() => [])).toEqual([]);
  });

  it("bad input is refused without taking a place in line", async () => {
    const { convert } = slowConvert(1);
    const app = track(createApp({ store, convert, maxConcurrent: 1, maxQueue: 1 }));
    const fd = new FormData();
    fd.set("media", new File(["x"], "a.txt", { type: "text/plain" }));
    const r = await app.request("/api/convert?async=1", {
      method: "POST",
      body: fd,
      headers: { "x-estampido-client": uuid(1) },
    });
    expect(r.status).toBe(415);
    expect((await (await app.request("/api/queue")).json()) as QueueInfo).toMatchObject({ waiting: 0, active: 0 });
    expect((await upload(app, 1)).status).toBe(202); // same browser can go right away
  });

  it("classic (sync) requests share the same queue and limits", async () => {
    const { convert, stats } = slowConvert(40);
    const app = track(createApp({ store, convert, maxConcurrent: 2, maxQueue: 2 }));
    const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => upload(app, i, false)));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(4);
    expect(rs.filter((r) => r.status === 503)).toHaveLength(4);
    expect(stats.peak).toBe(2);
  });
});
