import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { WASocket } from "baileys";
import type { FitMode } from "../../config/limits.js";
import { authDir, linksFile } from "../../config/paths.js";
import { consoleSink, fanOut, probeLinkedDevice, webhookSink, whatsappSink } from "./alerts.js";
import { jidDigits } from "./command.js";
import { connect, type PairingState } from "./connection.js";
import { startControlServer } from "./control.js";
import { registerHandlers } from "./handlers.js";
import { humanizer } from "./humanize.js";
import { LinkStore } from "./links.js";
import { installRawCapture } from "./rawCapture.js";
import type { SendMode } from "./saudio.js";
import { BOT_TMP_PREFIX } from "./saudio.js";
import { wipeSession } from "./session.js";
import { installRawEncode } from "./soundSticker.js";
import { cleanupTempDirs } from "./tempCleanup.js";
import { BotAgeStore } from "./volume.js";
import { Watchdog } from "./watchdog.js";

/**
 * WhatsApp bot (Baileys, unofficial → use a secondary number).
 *
 *   SVA_ALLOWED=595981234567,5215512345678 npm run bot          # /saudio
 *   SVA_ALLOWED=... npm run bot -- --capture                     # + reverse-engineering dumps
 *
 * Optional: SVA_PACK / SVA_AUTHOR (sticker metadata; author defaults to the sender's name).
 * Commands work from allowed numbers and from the bot's own account (fromMe),
 * including ones sent while the bot was offline (≤ 5 min old).
 */
const capture = process.argv.includes("--capture");
const allowed = new Set(
  (process.env.SVA_ALLOWED ?? "")
    .split(",")
    .map((s) => s.replace(/\D/g, ""))
    .filter(Boolean),
);

installRawCapture();
installRawEncode();

const modes: SendMode[] = ["native", "fallback", "both"];
const sendMode = (modes as string[]).includes(process.env.SVA_SEND_MODE ?? "")
  ? (process.env.SVA_SEND_MODE as SendMode)
  : "native";

const defaultFit: FitMode = process.env.SVA_FIT === "pad" ? "pad" : "crop";
const ratePerMinute = Number(process.env.SVA_RATE_PER_MIN ?? 6) || 0;
const selfChatOnly = /^(1|true|yes|si|sí)$/i.test(process.env.SVA_SELF_CHAT_ONLY ?? "");
const debug = /^(1|true|yes|si|sí)$/i.test(process.env.SVA_DEBUG ?? "");

console.log(
  `Estampido (bot) · envío ${sendMode} · encuadre ${defaultFit} · límite ${ratePerMinute || "∞"}/min${selfChatOnly ? " · solo chat propio" : ""} · captura ${capture ? "ON" : "OFF"}${debug ? " · diagnóstico ON" : ""} · remitentes permitidos: ${allowed.size || "solo tú (fromMe)"}`,
);

// Temp folders left by a previous crash (the bot is the only writer of these).
const cleaned = await cleanupTempDirs(BOT_TMP_PREFIX);
if (cleaned) console.log(`Limpieza: ${cleaned} carpeta(s) temporal(es) huérfana(s) borradas.`);

// Current socket (replaced on reconnect) for the local control endpoint.
let current: WASocket | null = null;
// Linking progress, served (token-protected) to the web's /admin page.
let pairing: PairingState = { kind: "waiting" };
const botAge = new BotAgeStore();
// One link store per bot number (kept across reconnects; a new number starts empty).
const stores = new Map<string, LinkStore>();
const linksFor = (sock: WASocket | null): LinkStore | null => {
  const digits = jidDigits(sock?.user?.id);
  if (!digits) return null;
  if (!stores.has(digits)) stores.set(digits, new LinkStore(linksFile(digits)));
  return stores.get(digits) ?? null;
};

// ── Watchdog: notice «connected but useless», heal what it can, tell the owner ──
const webhook = process.env.SVA_ALERT_WEBHOOK?.trim();
const watchdog = new Watchdog(
  {
    now: Date.now,
    probe: async () => {
      const sock = current;
      const result = sock ? await probeLinkedDevice(sock) : ("unknown" as const);
      if (debug) console.log(`[vigilante] prueba de vinculación: ${result}`);
      return result;
    },
    reconnect: (reason) => {
      console.warn(`[vigilante] Reconectando: ${reason}.`);
      current?.end(new Error(`watchdog: ${reason}`)); // close → the connection loop reconnects
    },
    relink: async (reason) => {
      console.warn(`[vigilante] Sesión muerta (${reason}): la borro para vincular de nuevo.`);
      const sock = current;
      current = null;
      pairing = { kind: "waiting" };
      sock?.end(new Error("watchdog: relink"));
      await wipeSession(authDir()); // keeps control.json; the reconnect (2 s) starts a fresh pairing
    },
    alert: fanOut(
      consoleSink,
      ...(/^(0|false|no)$/i.test(process.env.SVA_ALERT_WHATSAPP ?? "") ? [] : [whatsappSink(() => current)]),
      ...(webhook ? [webhookSink(webhook)] : []),
    ),
  },
  { autoRelink: /^(1|true|yes|si|sí)$/i.test(process.env.SVA_WATCHDOG_AUTORELINK ?? "") },
);
setInterval(() => void watchdog.tick(), 30_000).unref();
if (webhook) console.log("Vigilante: alertas también por webhook.");

await connect({
  authDir: authDir(),
  onConnection: (open) => watchdog.connectionChanged(open),
  onLoggedOut: () => watchdog.markUnlinked("cerrada desde el teléfono"),
  logLevel: process.env.SVA_LOG ?? "warn",
  pairingNumber: process.env.SVA_PAIRING_NUMBER,
  onPairing: (s) => {
    pairing = s;
  },
  onReady: (sock) => {
    current = sock;
    // Warm-up: remember when this number started, so a new number sends gently.
    const digits = jidDigits(sock.user?.id);
    if (digits) {
      void botAge.firstSeen(digits).then((at) => {
        humanizer.volume.setFirstSeen(at);
        const day = humanizer.volume.ageDays();
        const l = humanizer.volume.limits();
        console.log(`Ritmo: número en el día ${day} de calentamiento · máx. ${l.perMinute}/min y ${l.perHour}/h.`);
      });
    }
    registerHandlers(sock, {
      debug,
      links: linksFor(sock) ?? undefined,
      allowed,
      capture,
      captureDir: resolve("captures"),
      sendMode,
      defaultFit,
      ratePerMinute,
      selfChatOnly,
      onInbound: (ok) => (ok ? watchdog.inbound() : watchdog.decryptFailure()),
      metadata: { packName: process.env.SVA_PACK || undefined, publisher: process.env.SVA_AUTHOR || undefined },
    });
  },
});

// "Enviar a mi WhatsApp" from the web goes through this localhost-only endpoint.
const live = () => (current && (current.ws as { isOpen?: boolean }).isOpen !== false ? current : null);
const control = await startControlServer({
  current: live,
  links: () => linksFor(live()),
  pairing: () => pairing,
  health: () => ({ ...watchdog.health(), outbound: humanizer.volume.report() }),
});
console.log(`Control local en 127.0.0.1:${control.port} (para el botón de la web)`);
