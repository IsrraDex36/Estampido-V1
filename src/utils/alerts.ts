/**
 * Where alerts go (bot watchdog and the web's bot monitor). Every sink is
 * best-effort and time-boxed: a slow or failing sink never blocks anything.
 * - console: always
 * - webhook (SVA_ALERT_WEBHOOK): works even when WhatsApp is down
 *     ntfy.sh/<topic> → push notification on the phone (ntfy app), free
 *     discord.com/api/webhooks/… → Discord message
 *     anything else → POST JSON { level, kind, message, at }
 */
export type AlertLevel = "warn" | "critical" | "recovered";

export interface Alert {
  level: AlertLevel;
  kind: string;
  message: string;
}

export type AlertSink = (a: Alert) => Promise<void>;

export const consoleSink: AlertSink = async (a) => {
  const line = `[vigilante] ${a.message}`;
  if (a.level === "critical") console.error(line);
  else console.log(line);
};

/** Request for a webhook URL, by provider. Pure (tested). */
export function webhookRequest(
  url: string,
  a: Alert,
  at = new Date(),
): { body: string; headers: Record<string, string> } {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  if (host === "ntfy.sh" || host.startsWith("ntfy.")) {
    return {
      body: a.message,
      headers: {
        Title: "Estampido",
        Priority: a.level === "critical" ? "high" : "default",
        Tags: a.level === "recovered" ? "white_check_mark" : a.level === "critical" ? "rotating_light" : "warning",
      },
    };
  }
  if (host.endsWith("discord.com") || host.endsWith("discordapp.com")) {
    return {
      body: JSON.stringify({ content: `**Estampido** · ${a.message}` }),
      headers: { "content-type": "application/json" },
    };
  }
  return {
    body: JSON.stringify({ level: a.level, kind: a.kind, message: a.message, at: at.toISOString() }),
    headers: { "content-type": "application/json" },
  };
}

export function webhookSink(url: string, fetchImpl: typeof fetch = fetch): AlertSink {
  return async (a) => {
    const { body, headers } = webhookRequest(url, a);
    await fetchImpl(url, { method: "POST", body, headers, signal: AbortSignal.timeout(5_000) });
  };
}

/** Fan out to every sink; one failing sink doesn't stop the others. */
export const fanOut =
  (...sinks: AlertSink[]): AlertSink =>
  async (a) => {
    await Promise.allSettled(sinks.map((s) => s(a)));
  };
