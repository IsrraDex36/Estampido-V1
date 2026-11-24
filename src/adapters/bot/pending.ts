import { rm } from "node:fs/promises";
import type { WAMessage } from "baileys";
import type { SaudioCommand } from "./command.js";

/** A downloaded video waiting for the user's custom audio. */
export interface PendingJob {
  dir: string;
  videoPath: string;
  cmd: SaudioCommand;
  /** Original command message, to quote the result. */
  origin: WAMessage;
  expiresAt: number;
}

/**
 * One pending `/saudio voz` per sender. Expired or replaced jobs delete their
 * temp dir. `onExpire` lets the bot tell the user.
 */
export class PendingAudioStore {
  private readonly jobs = new Map<string, PendingJob & { timer: NodeJS.Timeout }>();

  constructor(
    readonly ttlMs = 2 * 60 * 1000,
    private readonly onExpire: (key: string, job: PendingJob) => void = () => {},
  ) {}

  get size(): number {
    return this.jobs.size;
  }

  async set(key: string, job: Omit<PendingJob, "expiresAt">): Promise<PendingJob> {
    await this.discard(key);
    const full = { ...job, expiresAt: Date.now() + this.ttlMs };
    const timer = setTimeout(() => {
      this.jobs.delete(key);
      void rm(full.dir, { recursive: true, force: true });
      this.onExpire(key, full);
    }, this.ttlMs);
    timer.unref();
    this.jobs.set(key, { ...full, timer });
    return full;
  }

  /** Remove and return the job; caller now owns its temp dir. */
  take(key: string): PendingJob | undefined {
    const job = this.jobs.get(key);
    if (!job) return undefined;
    clearTimeout(job.timer);
    this.jobs.delete(key);
    const { timer: _t, ...rest } = job;
    return rest;
  }

  /** Remove and delete temp files. Returns true if something was pending. */
  async discard(key: string): Promise<boolean> {
    const job = this.take(key);
    if (job) await rm(job.dir, { recursive: true, force: true });
    return Boolean(job);
  }
}

/** Per-chat, per-sender key (groups: participant inside the group). */
export const senderKey = (key: WAMessage["key"]): string => `${key.remoteJid ?? "?"}|${key.participant ?? ""}`;
