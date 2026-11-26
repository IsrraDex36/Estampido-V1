import { randomUUID } from "node:crypto";
import type { ConvertErrorCode, ConvertJobStatus, ConvertResponse } from "../contract.js";

type Final =
  | { state: "done"; result: ConvertResponse }
  | { state: "failed"; error: { code: ConvertErrorCode; message: string; status: number; retryAfterSec?: number } }
  | { state: "cancelled" };

interface Job {
  id: string;
  client: string;
  controller: AbortController;
  createdAt: number;
  startedAt: number | null;
  final: Final | null;
  finishedAt: number | null;
}

/**
 * Background conversion jobs (POST /api/convert?async=1): the browser gets a
 * job id right after uploading and polls it, so no HTTP connection is held
 * open for minutes (proxies cut those). Jobs belong to the browser that made
 * them (others get «not found») and are forgotten 30 min after finishing.
 */
export class JobRegistry {
  private readonly jobs = new Map<string, Job>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly keepMs = 30 * 60_000,
    private readonly maxJobs = 5_000,
  ) {}

  create(client: string): { id: string; signal: AbortSignal } {
    this.gc();
    const job: Job = {
      id: randomUUID(),
      client,
      controller: new AbortController(),
      createdAt: this.now(),
      startedAt: null,
      final: null,
      finishedAt: null,
    };
    this.jobs.set(job.id, job);
    return { id: job.id, signal: job.controller.signal };
  }

  started(id: string): void {
    const j = this.jobs.get(id);
    if (j) j.startedAt = this.now();
  }

  finish(id: string, final: Final): void {
    const j = this.jobs.get(id);
    if (!j || j.final) return;
    j.final = final;
    j.finishedAt = this.now();
  }

  /** The job, only for the browser that created it. */
  private own(id: string, client: string): Job | null {
    const j = this.jobs.get(id);
    return j && j.client === client ? j : null;
  }

  status(
    id: string,
    client: string,
    live: { position: number; etaSec: number; expectedSec: number },
  ): ConvertJobStatus | null {
    const j = this.own(id, client);
    if (!j) return null;
    if (j.final) return j.final;
    if (j.startedAt === null) return { state: "queued", position: live.position, etaSec: live.etaSec };
    return {
      state: "running",
      elapsedSec: Math.round((this.now() - j.startedAt) / 1000),
      expectedSec: Math.round(live.expectedSec),
    };
  }

  cancel(id: string, client: string): boolean {
    const j = this.own(id, client);
    if (!j) return false;
    if (!j.final) {
      j.controller.abort();
      this.finish(id, { state: "cancelled" });
    }
    return true;
  }

  get size(): number {
    return this.jobs.size;
  }

  /** Forget finished jobs past their time; hard cap on memory. */
  gc(): void {
    const t = this.now();
    for (const [id, j] of this.jobs) if (j.finishedAt !== null && t - j.finishedAt > this.keepMs) this.jobs.delete(id);
    if (this.jobs.size > this.maxJobs) {
      for (const [id, j] of this.jobs) {
        if (this.jobs.size <= this.maxJobs) break;
        if (j.final) this.jobs.delete(id);
      }
    }
  }
}
