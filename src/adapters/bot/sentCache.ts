import type { proto } from "baileys";

/**
 * Bounded cache of messages this bot sent, keyed by id. Baileys calls
 * getMessage() when a recipient device fails to decrypt and asks for a
 * retry; without it the phone can show "Waiting for this message".
 * Keeps the original object, so raw extra fields (field 134) survive the
 * re-encode.
 */
export class SentMessageCache {
  private readonly items = new Map<string, proto.IMessage>();
  constructor(private readonly max = 300) {}

  set(id: string | null | undefined, message: proto.IMessage | null | undefined): void {
    if (!id || !message) return;
    this.items.delete(id);
    this.items.set(id, message);
    if (this.items.size > this.max) this.items.delete(this.items.keys().next().value as string);
  }

  get(id: string | null | undefined): proto.IMessage | undefined {
    return id ? this.items.get(id) : undefined;
  }

  get size(): number {
    return this.items.size;
  }
}

/** Process-wide instance shared by the socket config and the senders. */
export const sentMessages = new SentMessageCache();
