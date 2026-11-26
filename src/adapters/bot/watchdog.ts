/**
 * Bot watchdog: notices when the bot is "connected" but useless, heals what
 * it can and tells the owner. Pure logic: time, the WhatsApp probe and every
 * side effect are injected, so it is tested with a fake clock.
 *
 * Signals
 * - connection open/closed and for how long
 * - probe (every probeEveryMs while open): does WhatsApp still list THIS
 *   device among the account's linked devices?
 * - decryption failures (Bad MAC / no session) in a sliding window
 *
 * Actions
 * - probe unanswered maxProbeFailures times in a row → reconnect
 * - device missing in 2 consecutive probes → critical alert; the session is
 *   wiped only with autoRelink (opt-in: a real logout already arrives as
 *   loggedOut and is handled by the connection, so a wrong probe must never
 *   destroy a good session)
 * - closed for longer than stuckAfterMs → force a reconnect
 * Alerts are deduplicated per kind (cooldown) and a recovery is announced.
 */

export type HealthStatus = "ok" | "degraded" | "down" | "unlinked" | "starting";
export type ProbeResult = "present" | "missing" | "unknown";
export type { Alert, AlertLevel } from "../../utils/alerts.js";

import type { Alert, AlertLevel } from "../../utils/alerts.js";

export interface WatchdogDeps {
  now: () => number;
  /** Ask WhatsApp whether this device is still linked. Throws/rejects when unanswered. */
  probe: () => Promise<ProbeResult>;
  reconnect: (reason: string) => void;
  relink: (reason: string) => Promise<void> | void;
  alert: (a: Alert) => Promise<void> | void;
}

export interface WatchdogConfig {
  probeEveryMs: number;
  probeTimeoutMs: number;
  maxProbeFailures: number;
  /** Closed this long → "down" + alert. */
  downAfterMs: number;
  /** Closed this long → force a reconnect (the normal loop got stuck). */
  stuckAfterMs: number;
  decryptWindowMs: number;
  decryptThreshold: number;
  alertCooldownMs: number;
  /** Wipe the session when the probe says «missing» (opt-in, see header). */
  autoRelink: boolean;
}

export const DEFAULT_WATCHDOG: WatchdogConfig = {
  probeEveryMs: 5 * 60_000,
  probeTimeoutMs: 20_000,
  maxProbeFailures: 3,
  downAfterMs: 3 * 60_000,
  stuckAfterMs: 10 * 60_000,
  decryptWindowMs: 60 * 60_000,
  decryptThreshold: 5,
  alertCooldownMs: 30 * 60_000,
  autoRelink: false,
};

export interface HealthReport {
  status: HealthStatus;
  since: number;
  connected: boolean;
  lastInboundAt: number | null;
  lastProbeOkAt: number | null;
  probeFailures: number;
  decryptFailuresRecent: number;
  reconnects24h: number;
  problems: string[];
}

const fmtMin = (ms: number) => `${Math.max(1, Math.round(ms / 60_000))} min`;

export class Watchdog {
  private readonly cfg: WatchdogConfig;
  private open = false;
  private changedAt: number;
  private everOpen = false;
  private lastInboundAt: number | null = null;
  private lastProbeAt = 0;
  private lastProbeOkAt: number | null = null;
  private probeFailures = 0;
  private missingStreak = 0;
  private probing = false;
  private unlinked = false;
  /** Probe says «missing» but we didn't act (autoRelink off). */
  private suspectUnlinked = false;
  private forcedForThisOutage = false;
  private decryptFailures: number[] = [];
  private reconnects: number[] = [];
  private lastAlertAt = new Map<string, number>();
  private status: HealthStatus = "starting";
  private statusSince: number;

  constructor(
    private readonly deps: WatchdogDeps,
    cfg: Partial<WatchdogConfig> = {},
  ) {
    this.cfg = { ...DEFAULT_WATCHDOG, ...cfg };
    this.changedAt = deps.now();
    this.statusSince = this.changedAt;
  }

  // ── Signals ──────────────────────────────────────────────────────────────

  connectionChanged(open: boolean): void {
    if (open === this.open) return;
    const now = this.deps.now();
    this.open = open;
    this.changedAt = now;
    if (open) {
      this.everOpen = true;
      this.unlinked = false;
      this.forcedForThisOutage = false;
      this.probeFailures = 0;
      this.missingStreak = 0;
      this.lastProbeAt = now; // first probe one period after (re)connecting
    } else {
      this.reconnects.push(now);
    }
    this.refresh();
  }

  /** A message arrived (any kind): proof that delivery works. */
  inbound(): void {
    this.lastInboundAt = this.deps.now();
  }

  /** A message arrived but could not be decrypted (Bad MAC, no session…). */
  decryptFailure(): void {
    this.decryptFailures.push(this.deps.now());
    this.refresh();
  }

  /** WhatsApp removed this device / logged it out: the owner must link again. */
  markUnlinked(reason: string): void {
    this.unlinked = true;
    this.refresh();
    void this.alert("critical", "unlinked", `🔌 El bot quedó desvinculado (${reason}). Vuelve a vincularlo en /admin.`);
  }

  // ── Loop ─────────────────────────────────────────────────────────────────

  /** Call periodically (e.g. every 30 s). */
  async tick(): Promise<void> {
    const now = this.deps.now();
    this.prune(now);

    if (!this.open && this.everOpen && !this.unlinked) {
      const closedFor = now - this.changedAt;
      if (closedFor >= this.cfg.downAfterMs) {
        void this.alert(
          "critical",
          "down",
          `🔴 El bot lleva ${fmtMin(closedFor)} sin conexión con WhatsApp. Intentando reconectar…`,
        );
      }
      if (closedFor >= this.cfg.stuckAfterMs && !this.forcedForThisOutage) {
        this.forcedForThisOutage = true;
        this.deps.reconnect(`sin conexión hace ${fmtMin(closedFor)}`);
      }
    }

    if (this.open && !this.probing && now - this.lastProbeAt >= this.cfg.probeEveryMs) {
      await this.runProbe();
    }
    this.refresh();
  }

  private async runProbe(): Promise<void> {
    this.probing = true;
    this.lastProbeAt = this.deps.now();
    try {
      const result = await withTimeout(this.deps.probe(), this.cfg.probeTimeoutMs);
      this.probeFailures = 0;
      if (result === "present") {
        this.missingStreak = 0;
        this.suspectUnlinked = false;
        this.lastProbeOkAt = this.deps.now();
      } else if (result === "missing") {
        this.missingStreak++;
        if (this.missingStreak >= 2) {
          this.missingStreak = 0;
          if (this.cfg.autoRelink) {
            this.unlinked = true;
            void this.alert(
              "critical",
              "unlinked",
              "🔌 WhatsApp ya no tiene vinculado este bot. Borré la sesión: entra a /admin y escanea el QR nuevo.",
            );
            await this.deps.relink("el dispositivo ya no aparece en la cuenta");
          } else {
            this.suspectUnlinked = true;
            void this.alert(
              "critical",
              "unlinked",
              "🔌 Parece que WhatsApp ya no tiene vinculado este bot (no aparece en los dispositivos de la cuenta). Revisa /admin y Dispositivos vinculados en el celular.",
            );
          }
        }
      }
    } catch {
      this.probeFailures++;
      if (this.probeFailures >= this.cfg.maxProbeFailures) {
        this.probeFailures = 0;
        void this.alert("warn", "probe", "🟠 WhatsApp no responde a las pruebas del bot. Reconectando…");
        this.deps.reconnect("las pruebas no tienen respuesta");
      }
    } finally {
      this.probing = false;
    }
  }

  // ── Status ───────────────────────────────────────────────────────────────

  private prune(now: number): void {
    this.decryptFailures = this.decryptFailures.filter((t) => now - t < this.cfg.decryptWindowMs);
    this.reconnects = this.reconnects.filter((t) => now - t < 24 * 60 * 60_000);
  }

  private compute(now: number): HealthStatus {
    if (this.unlinked) return "unlinked";
    if (!this.everOpen) return "starting";
    if (!this.open) return now - this.changedAt >= this.cfg.downAfterMs ? "down" : "degraded";
    if (this.suspectUnlinked || this.decryptFailures.length >= this.cfg.decryptThreshold || this.probeFailures > 0) {
      return "degraded";
    }
    return "ok";
  }

  private refresh(): void {
    const now = this.deps.now();
    this.prune(now);
    const next = this.compute(now);
    if (next === this.status) return;
    const prev = this.status;
    this.status = next;
    this.statusSince = now;
    if (next === "degraded" && this.decryptFailures.length >= this.cfg.decryptThreshold) {
      void this.alert(
        "warn",
        "decrypt",
        `🟠 ${this.decryptFailures.length} mensajes no se pudieron descifrar en la última hora (claves desincronizadas). Si sigue pasando, vuelve a vincular el bot en /admin.`,
      );
    }
    if (next === "ok" && (prev === "down" || prev === "degraded" || prev === "unlinked")) {
      // A recovery is always worth knowing (and resets the cooldowns).
      this.lastAlertAt.clear();
      void this.alert("recovered", "recovered", "🟢 El bot volvió a funcionar con normalidad.");
    }
  }

  private async alert(level: AlertLevel, kind: string, message: string): Promise<void> {
    const now = this.deps.now();
    const last = this.lastAlertAt.get(kind);
    if (level !== "recovered" && last !== undefined && now - last < this.cfg.alertCooldownMs) return;
    this.lastAlertAt.set(kind, now);
    try {
      await this.deps.alert({ level, kind, message });
    } catch {
      // an alert sink failing must never break the watchdog
    }
  }

  health(): HealthReport {
    const now = this.deps.now();
    this.prune(now);
    const problems: string[] = [];
    if (this.unlinked) problems.push("Desvinculado: escanea el QR en /admin.");
    if (this.everOpen && !this.open) problems.push(`Sin conexión hace ${fmtMin(now - this.changedAt)}.`);
    if (this.probeFailures > 0) problems.push(`${this.probeFailures} prueba(s) sin respuesta.`);
    if (this.suspectUnlinked) problems.push("WhatsApp no lista este dispositivo: revisa Dispositivos vinculados.");
    if (this.decryptFailures.length >= this.cfg.decryptThreshold) {
      problems.push(`${this.decryptFailures.length} mensajes indescifrables en la última hora.`);
    }
    return {
      status: this.compute(now),
      since: this.statusSince,
      connected: this.open,
      lastInboundAt: this.lastInboundAt,
      lastProbeOkAt: this.lastProbeOkAt,
      probeFailures: this.probeFailures,
      decryptFailuresRecent: this.decryptFailures.length,
      reconnects24h: this.reconnects.length,
      problems,
    };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
