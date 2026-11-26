import type { AlertSink } from "../../utils/alerts.js";

/**
 * Watches the bot FROM THE WEB PROCESS. The bot's own watchdog can't report
 * its own death; this one can: if the bot process is unreachable, or
 * WhatsApp stays disconnected, for longer than the grace period, it alerts
 * once (and again when it's back). Short blips (restarts, deploys) are ignored.
 */
export type BotState = "ok" | "unreachable" | "disconnected";

export interface BotMonitorOptions {
  status: () => Promise<{ available: boolean; connected: boolean }>;
  alert: AlertSink;
  now?: () => number;
  /** How long it must stay down before alerting (default 5 min). */
  graceMs?: number;
}

const minutes = (ms: number) => Math.max(1, Math.round(ms / 60_000));

export class BotMonitor {
  private downSince: number | null;
  private downState: BotState = "ok";
  private alerted = false;
  private readonly now: () => number;
  private readonly graceMs: number;

  constructor(private readonly opts: BotMonitorOptions) {
    this.now = opts.now ?? Date.now;
    this.graceMs = opts.graceMs ?? 5 * 60_000;
    // Right after boot the bot is still starting: the grace counts from here.
    this.downSince = this.now();
    this.downState = "unreachable";
  }

  private async read(): Promise<BotState> {
    try {
      const s = await this.opts.status();
      if (!s.available) return "unreachable";
      return s.connected ? "ok" : "disconnected";
    } catch {
      return "unreachable";
    }
  }

  /** One check. Returns the state seen (for tests/logs). */
  async tick(): Promise<BotState> {
    const state = await this.read();
    const t = this.now();
    if (state === "ok") {
      if (this.alerted && this.downSince !== null) {
        await this.send({
          level: "recovered",
          kind: "bot-monitor",
          message: `✅ El bot volvió a funcionar (estuvo caído ~${minutes(t - this.downSince)} min).`,
        });
      }
      this.downSince = null;
      this.downState = "ok";
      this.alerted = false;
      return state;
    }
    if (this.downSince === null || this.downState !== state) {
      // A different kind of problem restarts the clock only if nothing was reported yet.
      if (this.downSince === null) this.downSince = t;
      this.downState = state;
    }
    if (!this.alerted && t - this.downSince >= this.graceMs) {
      this.alerted = true;
      await this.send({
        level: "critical",
        kind: "bot-monitor",
        message:
          state === "unreachable"
            ? `🚨 El bot no responde desde hace ${minutes(t - this.downSince)} min: los envíos a WhatsApp están en pausa. Revisa el servidor (Coolify → logs / reiniciar).`
            : `🚨 El bot lleva ${minutes(t - this.downSince)} min sin conexión con WhatsApp. Si cerraste sesión o cambiaste de número, vincúlalo en /admin.`,
      });
    }
    return state;
  }

  private async send(a: Parameters<AlertSink>[0]): Promise<void> {
    await this.opts.alert(a).catch(() => {});
  }

  /** Check every `everyMs` (unref'd: never keeps the process alive). Returns stop(). */
  start(everyMs = 60_000): () => void {
    let running = false;
    const id = setInterval(() => {
      if (running) return;
      running = true;
      void this.tick().finally(() => {
        running = false;
      });
    }, everyMs);
    id.unref?.();
    return () => clearInterval(id);
  }
}
