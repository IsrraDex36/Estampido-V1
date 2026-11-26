import type { WAMessage, WAMessageKey, WASocket } from "baileys";
import { type Humanizer, humanizer, replyLikeHuman } from "./humanize.js";

/**
 * One status message per job, edited in place (⏳ → 🕒 → ⚙️ → ✔/❌) instead
 * of piling up replies. Fewer, calmer messages:
 * - edits keep a minimum gap; quick successive updates collapse into the
 *   latest one (only the newest text is ever sent);
 * - `essential: false` updates (queue position, «creating…») are skipped
 *   when the bot is busy; first and final messages always go out.
 * If editing fails (old client, network), it sends a new message so the
 * user always sees the latest state.
 */
export class StatusMessage {
  private key: WAMessageKey | undefined;
  /** Last text actually sent. */
  private last = "";
  /** Newest text requested. */
  private wanted = "";
  private lastAt = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly sock: WASocket,
    private readonly origin: WAMessage,
    private readonly h: Humanizer = humanizer,
  ) {}

  private get jid(): string {
    return this.origin.key.remoteJid as string;
  }

  set(text: string, { essential = true }: { essential?: boolean } = {}): Promise<void> {
    if (text === this.wanted) return this.chain;
    // Under load, skip «nice to know» edits (never the first message).
    if (!essential && this.key && this.h.enabled && this.h.volume.pressure() >= 0.75) return this.chain;
    this.wanted = text;
    this.chain = this.chain.then(() => this.flush()).catch(() => {});
    return this.chain;
  }

  private async flush(): Promise<void> {
    if (this.wanted === this.last) return; // a later flush already sent it
    if (this.key) {
      const wait = this.lastAt + this.h.editGapMs - this.h.now();
      if (wait > 0) await this.h.sleep(wait);
    }
    const text = this.wanted; // newest at send time: intermediate texts collapse
    if (text === this.last) return;
    this.last = text;
    if (this.key) {
      try {
        await this.h.pacer.turn();
        await this.sock.sendMessage(this.jid, { text, edit: this.key });
        this.lastAt = this.h.now(); // the gap counts from when it actually went out
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
    this.lastAt = this.h.now();
  }
}
