import type { WAMessage, WAMessageKey, WASocket } from "baileys";

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
  ) {}

  private get jid(): string {
    return this.origin.key.remoteJid as string;
  }

  async set(text: string): Promise<void> {
    if (text === this.last) return;
    this.last = text;
    if (this.key) {
      try {
        await this.sock.sendMessage(this.jid, { text, edit: this.key });
        return;
      } catch {
        // fall through: send a fresh message
      }
    }
    const sent = await this.sock.sendMessage(this.jid, { text }, { quoted: this.origin });
    this.key = sent?.key ?? undefined;
  }
}
