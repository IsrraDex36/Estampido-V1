import { jidDecode, jidNormalizedUser, USyncQuery, USyncUser, type WASocket } from "baileys";
import type { Alert, ProbeResult } from "./watchdog.js";

/**
 * Where watchdog alerts go. Every sink is best-effort and time-boxed: a slow
 * or failing sink never blocks the bot.
 * - console: always
 * - WhatsApp: the bot's own chat (only works while the bot can still send)
 * - webhook (SVA_ALERT_WEBHOOK): works even when WhatsApp is down
 *     ntfy.sh/<topic> → push notification on the phone (ntfy app), free
 *     discord.com/api/webhooks/… → Discord message
 *     anything else → POST JSON { level, kind, message, at }
 */
export type AlertSink = (a: Alert) => Promise<void>;

export const consoleSink: AlertSink = async (a) => {
  const line = `[vigilante] ${a.message}`;
  if (a.level === "critical") console.error(line);
  else console.log(line);
};

export function whatsappSink(current: () => WASocket | null): AlertSink {
  return async (a) => {
    const sock = current();
    if (!sock?.user) return;
    await sock.sendMessage(jidNormalizedUser(sock.user.id), { text: `🤖 Estampido · ${a.message}` });
  };
}

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

/**
 * Is THIS device still linked? A raw USync device query for our own account
 * (Baileys' getUSyncDevices filters our own device out, so it can't answer).
 * "unknown" when the server's answer has no device list (never acted upon).
 */
export async function probeLinkedDevice(sock: WASocket): Promise<ProbeResult> {
  const me = sock.user?.id;
  const decoded = me ? jidDecode(me) : undefined;
  if (!me || !decoded) return "unknown";
  const query = new USyncQuery().withContext("message").withDeviceProtocol();
  query.withUser(new USyncUser().withId(jidNormalizedUser(me)));
  const result = await sock.executeUSyncQuery(query);
  return deviceListed(result?.list?.[0]?.devices, decoded.device ?? 0);
}

/** Pure: does a USync device answer contain our device id? */
export function deviceListed(devices: unknown, myDevice: number): ProbeResult {
  const list = (devices as { deviceList?: { id: number }[] } | undefined)?.deviceList;
  if (!Array.isArray(list) || list.length === 0) return "unknown";
  return list.some((d) => d.id === myDevice) ? "present" : "missing";
}
