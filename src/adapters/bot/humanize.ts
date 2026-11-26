import type { WAMessage, WAMessageKey, WASocket } from "baileys";

/**
 * Behave like a person on WhatsApp, not like a script.
 *
 * What gets automated numbers restricted is behavior: bursts at fixed
 * intervals, the very same text sent again and again, replies that arrive
 * instantly. So the bot:
 * - answers with naturally written variants of each message (never the same
 *   one twice in a row in a chat) — real wording, no random or invisible
 *   characters (those break copy/paste and screen readers and look like spam);
 * - reads the message, shows «escribiendo…» for a time that depends on the
 *   length of the answer (with randomness), then sends;
 * - keeps a randomized gap between any two outgoing messages (never a fixed
 *   clock), shared by every send path.
 * It never starts conversations: it only answers people who wrote first.
 *
 * Everything is injectable (random source, sleep, clock) so it's testable;
 * SVA_HUMANIZE=0 turns pacing off and always picks the first variant.
 */

export type Rng = () => number;
export type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Picks a variant at random, never repeating the previous one for the same chat and message kind. */
export class VariantPicker {
  private readonly last = new Map<string, number>();

  constructor(
    private readonly rng: Rng = Math.random,
    /** Chats remembered (oldest forgotten first). */
    private readonly memory = 2_000,
    /** Always the canonical (first) variant: humanizing off. */
    private readonly firstOnly = false,
  ) {}

  pick<T>(kind: string, chat: string, variants: readonly T[]): T {
    if (variants.length === 0) throw new Error(`Sin variantes para «${kind}»`);
    if (variants.length === 1 || this.firstOnly) return variants[0] as T;
    const key = `${kind}\u0000${chat}`;
    const prev = this.last.get(key);
    // Uniform over the variants except the previous one.
    let i = Math.floor(this.rng() * (prev === undefined ? variants.length : variants.length - 1));
    if (prev !== undefined && i >= prev) i++;
    i = Math.min(i, variants.length - 1);
    this.last.delete(key); // re-insert → most recent at the end
    this.last.set(key, i);
    if (this.last.size > this.memory) this.last.delete(this.last.keys().next().value as string);
    return variants[i] as T;
  }
}

/** How long a person would take to type `text`: ~25 ms per character, 0.75–1.25× jitter, 0.7–3.2 s. */
export function typingDelayMs(text: string, rng: Rng = Math.random): number {
  const base = 450 + [...text].length * 25;
  const jittered = base * (0.75 + rng() * 0.5);
  return Math.round(Math.min(3_200, Math.max(700, jittered)));
}

/**
 * Serializes outgoing messages and keeps a random gap between any two of them
 * (minGap + up to jitter ms): no bursts, no fixed rhythm.
 */
export class SendPacer {
  private next = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly opts: { minGapMs?: number; jitterMs?: number; rng?: Rng; sleep?: Sleep; now?: () => number } = {},
  ) {}

  /** Resolves when it's this caller's turn to send. */
  turn(): Promise<void> {
    const { minGapMs = 700, jitterMs = 900, rng = Math.random, sleep = realSleep, now = Date.now } = this.opts;
    const run = this.queue.then(async () => {
      const wait = this.next - now();
      if (wait > 0) await sleep(wait);
      this.next = now() + minGapMs + Math.round(rng() * jitterMs);
    });
    this.queue = run.catch(() => {});
    return run;
  }
}

export interface Humanizer {
  enabled: boolean;
  picker: VariantPicker;
  pacer: SendPacer;
  rng: Rng;
  sleep: Sleep;
}

export function createHumanizer(
  opts: { enabled?: boolean; rng?: Rng; sleep?: Sleep; now?: () => number } = {},
): Humanizer {
  const enabled = opts.enabled ?? process.env.SVA_HUMANIZE !== "0";
  const rng = opts.rng ?? Math.random;
  const sleep = enabled ? (opts.sleep ?? realSleep) : async () => {};
  return {
    enabled,
    rng,
    sleep,
    // Disabled → always the first variant (deterministic tests and logs).
    picker: enabled ? new VariantPicker(rng) : new VariantPicker(rng, 0, true),
    pacer: new SendPacer(enabled ? { rng, sleep, now: opts.now } : { minGapMs: 0, jitterMs: 0, sleep, now: opts.now }),
  };
}

/** One per bot process: every send path shares the same pacing. */
export const humanizer: Humanizer = createHumanizer();

/** A variant of message `kind` for this chat (see phrases.ts). */
export function say(kind: string, chat: string, variants: readonly string[], h: Humanizer = humanizer): string {
  return h.picker.pick(kind, chat, variants);
}

type PresenceSock = Pick<WASocket, "sendMessage"> & Partial<Pick<WASocket, "readMessages" | "sendPresenceUpdate">>;

/**
 * Answer like a person: mark the message read, show «escribiendo…» for a
 * length-dependent random time, wait for the shared pacer, send. Presence and
 * read receipts are best-effort (never block the answer).
 */
export async function replyLikeHuman(
  sock: PresenceSock,
  jid: string,
  text: string,
  opts: { quoted?: WAMessage; read?: WAMessageKey; h?: Humanizer } = {},
) {
  const h = opts.h ?? humanizer;
  if (h.enabled) {
    if (opts.read) await sock.readMessages?.([opts.read]).catch(() => {});
    await sock.sendPresenceUpdate?.("composing", jid).catch(() => {});
    await h.sleep(typingDelayMs(text, h.rng));
    await sock.sendPresenceUpdate?.("paused", jid).catch(() => {});
  }
  await h.pacer.turn();
  return sock.sendMessage(jid, { text }, opts.quoted ? { quoted: opts.quoted } : undefined);
}
