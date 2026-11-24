import { generateMessageIDV2, type WASocket } from "baileys";
import { isAllowedSender, type KeyLike } from "./command.js";

/** Bounded set of message IDs this bot sent (to never react to its own output). */
export class SentIds {
  private readonly ids = new Set<string>();
  constructor(private readonly max = 1000) {}

  add(id: string): void {
    this.ids.add(id);
    if (this.ids.size > this.max) this.ids.delete(this.ids.values().next().value as string);
  }

  has(id: string | null | undefined): boolean {
    return id != null && this.ids.has(id);
  }
}

/**
 * Make every `sock.sendMessage` use a pre-generated id recorded in `sent`
 * *before* sending: Baileys emits the bot's own `messages.upsert` (type
 * "append") during the send, so recording after the call would race.
 */
export function trackOwnSends(sock: WASocket, sent: SentIds): void {
  const original = sock.sendMessage.bind(sock);
  sock.sendMessage = ((jid, content, options = {}) => {
    const messageId = options.messageId ?? generateMessageIDV2(sock.user?.id);
    sent.add(messageId);
    return original(jid, content, { ...options, messageId });
  }) as WASocket["sendMessage"];
}

/** Max age for "append" (offline-delivered) messages to still be handled. */
export const MAX_OFFLINE_AGE_SEC = 5 * 60;

export interface Incoming {
  type: "notify" | "append" | string;
  key: KeyLike & { id?: string | null };
  messageTimestamp?: number | { toNumber(): number } | null;
}

const toSeconds = (t: Incoming["messageTimestamp"]): number | null =>
  t == null ? null : typeof t === "number" ? t : t.toNumber();

/**
 * Should the bot act on this upsert?
 * - never on its own sends (tracked ids) → no reply loops
 * - only allowed senders (owner's own account = fromMe, or SVA_ALLOWED)
 * - "notify" = real-time; "append" = delivered after the bot was offline:
 *   accepted only if recent, so a restart doesn't replay old commands.
 */
export function shouldHandle(
  m: Incoming,
  { allowed, sent, nowSec = Date.now() / 1000 }: { allowed: ReadonlySet<string>; sent: SentIds; nowSec?: number },
): boolean {
  if (sent.has(m.key.id)) return false;
  if (!isAllowedSender(m.key, allowed)) return false;
  if (m.type === "notify") return true;
  if (m.type !== "append") return false;
  const ts = toSeconds(m.messageTimestamp);
  return ts !== null && nowSec - ts <= MAX_OFFLINE_AGE_SEC;
}
