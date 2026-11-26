import { randomInt } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { RateLimiter } from "../../utils/rateLimit.js";

/**
 * "This browser ↔ this WhatsApp chat" links, owned by the bot (it is the one
 * that sees the code arrive). Clients are identified ONLY by a SHA-256 hash
 * computed by the API; raw client ids never reach the bot or the disk.
 * One file per bot number: changing the number starts from scratch.
 */

/** No look-alikes (0/O, 1/I/L) so codes survive being read aloud or retyped. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_TTL_MS = 10 * 60_000;
/**
 * Codes waiting at once. Every «Entrar con WhatsApp» opens one for 10 min, so
 * under traffic many are abandoned: at the cap the OLDEST is dropped (its
 * owner just gets a new one) instead of refusing new people.
 */
export const MAX_PENDING = 5_000;
/** 31^5 ≈ 28.6 M codes: guessing a live one stays < 0.02 % even with the cap full. */
export const CODE_LENGTH = 5;

/** Finds "EST-XXXXX" anywhere in a message (the wa.me prefill adds a greeting). */
const CODE_RE = new RegExp(`\\bEST-([${ALPHABET}]{${CODE_LENGTH}})\\b`, "i");
export const extractCode = (text: string | undefined | null): string | null => {
  const m = text?.match(CODE_RE);
  return m ? `EST-${(m[1] as string).toUpperCase()}` : null;
};

export function newCode(rand: (max: number) => number = randomInt): string {
  let s = "";
  for (let i = 0; i < CODE_LENGTH; i++) s += ALPHABET[rand(ALPHABET.length)];
  return `EST-${s}`;
}

const HASH_RE = /^[0-9a-f]{64}$/;
export const isClientHash = (h: string): boolean => HASH_RE.test(h);

interface Pending {
  client: string;
  expiresAt: number;
}
interface Link {
  /** Chat to deliver to. */
  jid: string;
  linkedAt: number;
  /** Who the person is (phone jid when known); older links lack it (= jid). */
  identity?: string;
}
interface FileShape {
  links: Record<string, Link>;
}

export type LinkStatus =
  | { state: "unlinked" }
  | { state: "pending"; code: string; expiresAt: number }
  | { state: "linked"; jid: string; linkedAt: number; identity?: string };

export type RedeemResult = { ok: true; client: string } | { ok: false; reason: "unknown" | "expired" | "rate_limited" };

export class LinkStore {
  private links: Record<string, Link> | null = null;
  /** Codes live in memory only: a restart just means "generate a new code". */
  /** code → pending. Insertion order = creation order = expiry order (fixed TTL). */
  private readonly pending = new Map<string, Pending>();
  /** client → its pending code: O(1) status/replace while many people poll. */
  private readonly byClient = new Map<string, string>();
  private readonly attempts = new RateLimiter(5, 10 * 60_000);
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    readonly file: string,
    private readonly now: () => number = Date.now,
  ) {}

  private async load(): Promise<Record<string, Link>> {
    if (this.links) return this.links;
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf8")) as Partial<FileShape>;
      this.links = parsed.links && typeof parsed.links === "object" ? parsed.links : {};
    } catch {
      this.links = {};
    }
    return this.links;
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  private async persist(links: Record<string, Link>): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify({ links } satisfies FileShape), { mode: 0o600 });
    await rename(tmp, this.file);
  }

  private drop(code: string): void {
    const p = this.pending.get(code);
    if (!p) return;
    this.pending.delete(code);
    if (this.byClient.get(p.client) === code) this.byClient.delete(p.client);
  }

  /** Expired codes sit at the front (expiry order): stop at the first live one. */
  private sweep(): void {
    const now = this.now();
    for (const [code, p] of this.pending) {
      if (p.expiresAt > now) break;
      this.drop(code);
    }
  }

  /** Codes waiting right now (for tests/metrics). */
  get pendingCount(): number {
    return this.pending.size;
  }

  /** New code for a client (replaces its previous pending one). Never refuses: at the cap, the oldest goes. */
  createCode(client: string): { code: string; expiresAt: number } {
    this.sweep();
    const previous = this.byClient.get(client);
    if (previous) this.drop(previous);
    while (this.pending.size >= MAX_PENDING) {
      const oldest = this.pending.keys().next().value;
      if (oldest === undefined) break;
      this.drop(oldest);
    }
    let code = newCode();
    while (this.pending.has(code)) code = newCode();
    const expiresAt = this.now() + CODE_TTL_MS;
    this.pending.set(code, { client, expiresAt });
    this.byClient.set(client, code);
    return { code, expiresAt };
  }

  /** A chat sent a code: link it (one use). `sender` keys the brute-force limit. */
  redeem(code: string, jid: string, sender: string, identity: string = jid): Promise<RedeemResult> {
    return this.exclusive(async () => {
      if (this.attempts.take(sender, this.now()) > 0) return { ok: false, reason: "rate_limited" };
      const p = this.pending.get(code);
      if (!p) return { ok: false, reason: "unknown" };
      this.drop(code);
      if (p.expiresAt <= this.now()) return { ok: false, reason: "expired" };
      const links = {
        ...(await this.load()),
        [p.client]: { jid, linkedAt: this.now(), ...(identity !== jid ? { identity } : {}) },
      };
      await this.persist(links);
      this.links = links;
      return { ok: true, client: p.client };
    });
  }

  async status(client: string): Promise<LinkStatus> {
    const link = (await this.load())[client];
    if (link) return { state: "linked", ...link };
    this.sweep();
    const code = this.byClient.get(client);
    const p = code ? this.pending.get(code) : undefined;
    if (code && p) return { state: "pending", code, expiresAt: p.expiresAt };
    return { state: "unlinked" };
  }

  async target(client: string): Promise<string | null> {
    return (await this.load())[client]?.jid ?? null;
  }

  unlink(client: string): Promise<boolean> {
    return this.exclusive(async () => {
      const code = this.byClient.get(client);
      if (code) this.drop(code);
      const links = await this.load();
      if (!(client in links)) return false;
      const { [client]: _gone, ...rest } = links;
      await this.persist(rest);
      this.links = rest;
      return true;
    });
  }
}

/** "…5678" — never the full number in API responses or logs. */
export const maskJid = (jid: string): string => `…${(jid.split("@")[0] ?? "").replace(/\D/g, "").slice(-4)}`;
