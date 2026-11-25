import { generateMessageIDV2, type WASocket } from "baileys";
import { isAllowedSender, jidDigits, type KeyLike } from "./command.js";
import { sentMessages } from "./sentCache.js";

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
  sock.sendMessage = (async (jid, content, options = {}) => {
    const messageId = options.messageId ?? generateMessageIDV2(sock.user?.id);
    sent.add(messageId);
    const result = await original(jid, content, { ...options, messageId });
    sentMessages.set(result?.key.id, result?.message);
    return result;
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
export interface RoutingContext {
  allowed: ReadonlySet<string>;
  sent: SentIds;
  nowSec?: number;
  /**
   * When the bot runs on your own number: only react to your messages in your
   * chat with yourself (not when you type /saudio in someone else's chat).
   */
  selfChatOnly?: boolean;
  /** Digits of the bot account's own ids (PN and LID). */
  selfIds?: ReadonlySet<string>;
}

export function shouldHandle(m: Incoming, ctx: RoutingContext): boolean {
  return ignoreReason(m, ctx) === null;
}

/** Why an upsert is ignored (null = handle it). Same rules as shouldHandle; used by SVA_DEBUG logs. */
export function ignoreReason(
  m: Incoming,
  { allowed, sent, nowSec = Date.now() / 1000, selfChatOnly, selfIds }: RoutingContext,
): string | null {
  if (sent.has(m.key.id)) return "es un envío del propio bot";
  if (!isAllowedSender(m.key, allowed)) return "remitente no permitido (SVA_ALLOWED)";
  if (selfChatOnly && m.key.fromMe) {
    const chat = jidDigits(m.key.remoteJid);
    if (!chat || !selfIds?.has(chat)) return "no es tu chat contigo (SVA_SELF_CHAT_ONLY)";
  }
  if (m.type === "notify") return null;
  if (m.type !== "append") return `tipo de entrega «${m.type}»`;
  const ts = toSeconds(m.messageTimestamp);
  return ts !== null && nowSec - ts <= MAX_OFFLINE_AGE_SEC ? null : "mensaje antiguo (llegó con el bot apagado)";
}

/** Chat kind + last 4 digits, never the full number (logs). */
export function describeChat(jid: string | null | undefined, selfIds?: ReadonlySet<string>): string {
  if (!jid) return "chat ?";
  if (jid.endsWith("@g.us")) return "grupo";
  if (jid === "status@broadcast") return "estados";
  const digits = jidDigits(jid);
  if (digits && selfIds?.has(digits)) return "tu chat contigo";
  return `privado …${(digits ?? "").slice(-4)}`;
}

/** Digits of the bot account's own JIDs (PN + LID) for self-chat detection. */
export function selfIdsOf(user: { id?: string; lid?: string } | undefined): Set<string> {
  return new Set([user?.id, user?.lid].map((j) => jidDigits(j)).filter((d): d is string => d !== null));
}
