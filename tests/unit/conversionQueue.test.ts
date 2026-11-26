import { describe, expect, it } from "vitest";
import { ConversionQueue, JobTimeoutError } from "../../src/adapters/http/jobs/queue.js";
import { JobRegistry } from "../../src/adapters/http/jobs/registry.js";
import { CancelledError } from "../../src/core/errors.js";

const opts = { concurrency: 2, maxQueued: 4, maxWaitSec: 1000, jobTimeoutSec: 60 };
const tick = () => new Promise((r) => setTimeout(r, 0));

/** A job you finish by hand. */
function gate() {
  let open!: () => void;
  let fail!: (e: unknown) => void;
  const p = new Promise<void>((res, rej) => {
    open = res;
    fail = rej;
  });
  return { p, open, fail };
}

function admitOk(q: ConversionQueue, client: string) {
  const a = q.admit(client);
  if (!a.ok) throw new Error(`refused ${client}: ${a.code}`);
  return a.ticket;
}

describe("ConversionQueue: concurrency and order", () => {
  it("never runs more than `concurrency` at once; FIFO; positions update", async () => {
    const q = new ConversionQueue(opts);
    let running = 0;
    let peak = 0;
    const order: string[] = [];
    const gates = new Map<string, ReturnType<typeof gate>>();
    const start = (client: string) => {
      const g = gate();
      gates.set(client, g);
      return q.run(admitOk(q, client), async () => {
        running++;
        peak = Math.max(peak, running);
        order.push(client);
        await g.p;
        running--;
      });
    };
    const all = ["a", "b", "c", "d", "e"].map(start);
    await tick();
    expect(order).toEqual(["a", "b"]);
    expect(q.positionOf("c")).toBe(1);
    expect(q.positionOf("e")).toBe(3);
    expect(q.snapshot()).toMatchObject({ active: 2, waiting: 3 });
    gates.get("a")?.open();
    await tick();
    expect(order).toEqual(["a", "b", "c"]);
    expect(q.positionOf("e")).toBe(2);
    for (const k of ["b", "c", "d", "e"]) {
      gates.get(k)?.open();
      await tick();
    }
    await Promise.all(all);
    expect(order).toEqual(["a", "b", "c", "d", "e"]);
    expect(peak).toBe(2);
    expect(q.snapshot()).toMatchObject({ active: 0, waiting: 0 });
  });

  it("a failing job frees its slot and the next one starts", async () => {
    const q = new ConversionQueue({ ...opts, concurrency: 1 });
    const first = q.run(admitOk(q, "a"), async () => {
      throw new Error("boom");
    });
    const second = q.run(admitOk(q, "b"), async () => "ok");
    await expect(first).rejects.toThrow("boom");
    await expect(second).resolves.toBe("ok");
  });
});

describe("ConversionQueue: admission (load shedding)", () => {
  it("one job per person at a time; free again once it ends", async () => {
    const q = new ConversionQueue(opts);
    const g = gate();
    const t = admitOk(q, "ana");
    expect(q.admit("ana")).toMatchObject({ ok: false, code: "one_at_a_time" });
    const run = q.run(t, () => g.p);
    expect(q.admit("ana")).toMatchObject({ ok: false, code: "one_at_a_time" });
    g.open();
    await run;
    expect(q.admit("ana").ok).toBe(true);
  });

  it("a bounded line: uploads still arriving count; beyond it → busy with Retry-After", () => {
    const q = new ConversionQueue({ ...opts, concurrency: 2, maxQueued: 3 });
    const tickets = ["a", "b", "c", "d", "e"].map((c) => admitOk(q, c)); // 2 free slots + 3 in line
    const refused = q.admit("f");
    expect(refused).toMatchObject({ ok: false, code: "busy" });
    expect(refused.ok === false && refused.retryAfterSec).toBeGreaterThanOrEqual(5);
    tickets[0]?.release(); // an upload failed: the place is free again
    expect(q.admit("f").ok).toBe(true);
  });

  it("refuses when the estimated wait is too long, even with room in line", () => {
    const q = new ConversionQueue({ ...opts, concurrency: 1, maxQueued: 100, maxWaitSec: 20, initialJobSec: 10 });
    admitOk(q, "a");
    admitOk(q, "b"); // eta 10 s
    admitOk(q, "c"); // eta 20 s
    expect(q.admit("d")).toMatchObject({ ok: false, code: "busy" });
  });

  it("release is idempotent and harmless after run", async () => {
    const q = new ConversionQueue(opts);
    const t = admitOk(q, "a");
    await q.run(t, async () => {});
    t.release();
    t.release();
    expect(q.snapshot().waiting).toBe(0);
    await expect(q.run(t, async () => {})).rejects.toThrow(/Ticket/);
  });
});

describe("ConversionQueue: ETA", () => {
  it("estimates the wait from the average job time and learns from real jobs", async () => {
    let now = 0;
    const q = new ConversionQueue({ ...opts, concurrency: 2, initialJobSec: 10, now: () => now });
    expect(q.snapshot().etaSec).toBe(0);
    const g = [gate(), gate()];
    const runs = [0, 1].map((i) => q.run(admitOk(q, `r${i}`), () => g[i]?.p ?? Promise.resolve()));
    await tick();
    expect(q.snapshot().etaSec).toBe(10); // both slots busy → next waits ~one job
    const queued = [2, 3, 4].map((i) =>
      q.run(admitOk(q, `w${i}`), async () => {
        now += 20_000;
      }),
    );
    await tick();
    expect(q.etaOf("w2")).toBe(10);
    expect(q.etaOf("w4")).toBe(20); // third in line: second round
    now += 20_000; // jobs actually take 20 s
    g[0]?.open();
    g[1]?.open();
    await Promise.all([...runs, ...queued]);
    expect(q.snapshot().avgJobSec).toBeGreaterThan(10); // learned: slower than guessed
  });
});

describe("ConversionQueue: cancellation and time limit", () => {
  it("cancelling while waiting leaves the line without running; place freed", async () => {
    const q = new ConversionQueue({ ...opts, concurrency: 1 });
    const g = gate();
    const first = q.run(admitOk(q, "a"), () => g.p);
    const ctrl = new AbortController();
    let ran = false;
    const second = q.run(
      admitOk(q, "b"),
      async () => {
        ran = true;
      },
      { signal: ctrl.signal },
    );
    await tick();
    expect(q.positionOf("b")).toBe(1);
    ctrl.abort();
    await expect(second).rejects.toBeInstanceOf(CancelledError);
    expect(q.positionOf("b")).toBe(0);
    expect(q.admit("b").ok).toBe(true); // can try again
    g.open();
    await first;
    expect(ran).toBe(false);
  });

  it("cancelling while running aborts the job's signal", async () => {
    const q = new ConversionQueue(opts);
    const ctrl = new AbortController();
    const run = q.run(
      admitOk(q, "a"),
      (signal) =>
        new Promise<void>((_, reject) => signal.addEventListener("abort", () => reject(new CancelledError()))),
      { signal: ctrl.signal },
    );
    ctrl.abort();
    await expect(run).rejects.toBeInstanceOf(CancelledError);
    expect(q.snapshot().active).toBe(0);
  });

  it("a job past the time limit is aborted with JobTimeoutError and its slot freed", async () => {
    const q = new ConversionQueue({ ...opts, concurrency: 1, jobTimeoutSec: 0.05 });
    const stuck = q.run(
      admitOk(q, "a"),
      (signal) => new Promise<void>((_, reject) => signal.addEventListener("abort", () => reject(new Error("killed")))),
    );
    await expect(stuck).rejects.toBeInstanceOf(JobTimeoutError);
    await expect(q.run(admitOk(q, "b"), async () => "next")).resolves.toBe("next");
  });
});

describe("JobRegistry", () => {
  it("jobs belong to their browser; status flows queued → running → done; forgotten after 30 min", () => {
    let now = 0;
    const r = new JobRegistry(() => now);
    const { id } = r.create("me");
    const live = { position: 2, etaSec: 9, expectedSec: 8 };
    expect(r.status(id, "someone-else", live)).toBeNull();
    expect(r.status(id, "me", live)).toEqual({ state: "queued", position: 2, etaSec: 9 });
    r.started(id);
    now += 3_000;
    expect(r.status(id, "me", live)).toEqual({ state: "running", elapsedSec: 3, expectedSec: 8 });
    r.finish(id, { state: "failed", error: { code: "timeout", message: "x", status: 504 } });
    r.finish(id, { state: "cancelled" }); // first final state wins
    expect(r.status(id, "me", live)).toMatchObject({ state: "failed" });
    now += 31 * 60_000;
    r.gc();
    expect(r.status(id, "me", live)).toBeNull();
  });

  it("cancel aborts the job signal once; only the owner can cancel", () => {
    const r = new JobRegistry();
    const { id, signal } = r.create("me");
    expect(r.cancel(id, "other")).toBe(false);
    expect(signal.aborted).toBe(false);
    expect(r.cancel(id, "me")).toBe(true);
    expect(signal.aborted).toBe(true);
    expect(r.status(id, "me", { position: 0, etaSec: 0, expectedSec: 0 })).toEqual({ state: "cancelled" });
  });

  it("memory stays bounded", () => {
    const r = new JobRegistry(Date.now, 60_000, 10);
    for (let i = 0; i < 50; i++) {
      const { id } = r.create(`c${i}`);
      r.finish(id, { state: "cancelled" });
    }
    expect(r.size).toBeLessThanOrEqual(11);
  });
});
