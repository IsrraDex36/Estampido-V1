import type { WAMessage, WAMessageKey, WASocket } from "baileys";
import { type Humanizer, humanizer, replyLikeHuman } from "./humanize.js";

/**
 * One status message per job, edited in place (⏳ → 🕒 → ⚙️ → ✔/❌) instead
 * of piling up replies. If editing fails (old client, network), it falls back
 * to sending a new message so the user always sees the latest state.
 */
export class StatusMessage {
  private key: WAMessageKey | undefined;
  private last = "";

  constructor(
    private readonly sock: WASocket,
    private readonly origin: WAMessage,
    private readonly h: Humanizer = humanizer,
  ) {}

  private get jid(): string {
    return this.origin.key.remoteJid as string;
  }

  async set(text: string): Promise<void> {
    if (text === this.last) return;
    this.last = text;
    if (this.key) {
      try {
        await this.h.pacer.turn(); // edits too: never a burst of protocol messages
        await this.sock.sendMessage(this.jid, { text, edit: this.key });
        return;
      } catch {
        // fall through: send a fresh message
      }
    }
    // First status: read + «escribiendo…» + paced, like any human reply.
    const sent = await replyLikeHuman(this.sock, this.jid, text, {
      quoted: this.origin,
      read: this.origin.key,
      h: this.h,
    });
    this.key = sent?.key ?? undefined;
  }
}
