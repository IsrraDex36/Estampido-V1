import { randomBytes } from "node:crypto";
import { fetchLatestBaileysVersion, fetchLatestWaWebVersion, proto, type WAVersion } from "baileys";

/**
 * Workarounds for new-device pairing on Baileys 7.0.0-rc14 (Nov 2026):
 *
 * 1. Stale version: fetchLatestBaileysVersion() returns a WA Web build months
 *    old (2.3000.1043857760 vs live 2.3000.1056132189), and WhatsApp refuses to
 *    link outdated clients. Prefer the live version.
 *    Ref: https://github.com/FaserF/ha-whatsapp/issues/106 (upstream #2679)
 *
 * 2. companion_reg_refresh: after the QR is scanned WhatsApp may ask the
 *    companion to rotate its ADV secret. rc14 ignores it → pair-success never
 *    arrives → phone shows "Couldn't link device". Same behavior as the
 *    (unmerged) upstream fix: new advSecretKey, persist, re-render the QR.
 *    Ref: https://github.com/WhiskeySockets/Baileys/issues/2737, PR #2765
 */
export async function resolveWaVersion(): Promise<{ version?: WAVersion; source: string }> {
  try {
    const { version } = await fetchLatestWaWebVersion({});
    return { version, source: "web.whatsapp.com" };
  } catch {
    try {
      const { version } = await fetchLatestBaileysVersion();
      return { version, source: "baileys (puede estar desactualizada)" };
    } catch {
      return { source: "por defecto de Baileys" };
    }
  }
}

const QR_PREFIX = "https://wa.me/settings/linked_devices#";

/** Replace the ADV secret (4th field) in pairing QR data. Pure. */
export function withAdvSecret(qr: string, advSecretB64: string): string {
  const hashAt = qr.indexOf("#");
  const head = hashAt >= 0 ? qr.slice(0, hashAt + 1) : "";
  const fields = (hashAt >= 0 ? qr.slice(hashAt + 1) : qr).split(",");
  if (fields.length < 4) return qr;
  fields[3] = advSecretB64;
  return head + fields.join(",");
}

export const isPairingQr = (qr: string): boolean => qr.startsWith(QR_PREFIX) || qr.split(",").length >= 4;

export const newAdvSecret = (): string => randomBytes(32).toString("base64");

interface NodeLike {
  content?: unknown;
}

/** The notification must carry a companion_reg_refresh / pair-device-rotate-qr child. */
export function isRotateRequest(node: NodeLike): boolean {
  return (
    Array.isArray(node.content) &&
    node.content.some((c: { tag?: string }) => c?.tag === "companion_reg_refresh" || c?.tag === "pair-device-rotate-qr")
  );
}

/**
 * History sync policy. Keep only the light syncs that carry LID↔PN mappings
 * and contact names (Baileys warns that disabling *all* sync breaks LID
 * mappings → session errors). Skip message history: the bot never reads it,
 * and with RECENT disabled Baileys goes online right after pending
 * notifications instead of buffering new messages for up to 20–30 s.
 */
const HISTORY_TYPES_TO_SYNC = new Set<number>([
  proto.HistorySync.HistorySyncType.INITIAL_BOOTSTRAP,
  proto.HistorySync.HistorySyncType.PUSH_NAME,
  proto.HistorySync.HistorySyncType.NON_BLOCKING_DATA,
]);

export const shouldSyncHistory = ({ syncType }: { syncType?: number | null }): boolean =>
  syncType != null && HISTORY_TYPES_TO_SYNC.has(syncType);
