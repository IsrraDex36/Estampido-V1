import { jidDecode, jidNormalizedUser, USyncQuery, USyncUser, type WASocket } from "baileys";
import type { AlertSink } from "../../utils/alerts.js";
import { humanizer } from "./humanize.js";
import type { ProbeResult } from "./watchdog.js";

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
export type { AlertSink } from "../../utils/alerts.js";
export { consoleSink, fanOut, webhookRequest, webhookSink } from "../../utils/alerts.js";

export function whatsappSink(current: () => WASocket | null): AlertSink {
  return async (a) => {
    const sock = current();
    if (!sock?.user) return;
    await humanizer.pacer.turn(); // alerts share the pacing and the volume count
    await sock.sendMessage(jidNormalizedUser(sock.user.id), { text: `🤖 Estampido · ${a.message}` });
  };
}

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
