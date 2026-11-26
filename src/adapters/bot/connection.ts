import { rm } from "node:fs/promises";
import makeWASocket, { Browsers, DisconnectReason, useMultiFileAuthState, type WASocket } from "baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { isRotateRequest, newAdvSecret, resolveWaVersion, shouldSyncHistory, withAdvSecret } from "./pairing.js";
import { sentMessages } from "./sentCache.js";
import { wipeSession } from "./session.js";

export interface ConnectOptions {
  /** Auth state folder. Contains session keys → never commit. */
  authDir: string;
  onReady: (sock: WASocket) => void;
  logLevel?: string;
  /**
   * Link with an 8-character code instead of the QR (servers have no screen):
   * WhatsApp → Dispositivos vinculados → Vincular con número de teléfono.
   * Digits only, with country code (e.g. 5215512345678).
   */
  pairingNumber?: string;
  /** Linking progress, for the protected /admin page (QR as data, code, connected). */
  onPairing?: (state: PairingState) => void;
  /** Socket opened/closed (watchdog). */
  onConnection?: (open: boolean, sock: WASocket) => void;
  /** The phone removed this (linked) device; the dead session was wiped (watchdog alert). */
  onLoggedOut?: () => void;
}

export type PairingState =
  | { kind: "waiting" }
  | { kind: "qr"; qr: string }
  | { kind: "code"; code: string }
  | { kind: "connected"; id: string };

/** "5215512345678" from "+52 1 55 1234 5678". Pure; null if implausible. */
export function normalizePairingNumber(raw: string | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** "ABCD1234" → "ABCD-1234" (as WhatsApp shows it). Pure. */
export const formatPairingCode = (code: string): string =>
  code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;

/** Connect with QR login and auto-reconnect (except on logout). */
export async function connect(opts: ConnectOptions): Promise<void> {
  const { authDir, onReady, logLevel = "warn" } = opts;
  const pairingNumber = normalizePairingNumber(opts.pairingNumber);
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version, source } = await resolveWaVersion();
  if (!state.creds.me) console.log(`WhatsApp Web ${version?.join(".") ?? "?"} (${source})`);

  const sock = makeWASocket({
    auth: state,
    version,
    browser: Browsers.macOS("Desktop"),
    logger: pino({ level: logLevel }),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    // Light syncs only (LID mappings, names); no message history → online
    // right away, no 20–30 s event buffering. See shouldSyncHistory.
    shouldSyncHistoryMessage: shouldSyncHistory,
    // Re-send support when a device fails to decrypt one of our messages.
    getMessage: async (key) => sentMessages.get(key.id),
  });

  sock.ev.on("creds.update", saveCreds);

  // Always render the QR with the *current* ADV secret (it may be rotated below).
  let lastQr: string | undefined;
  const showQr = (qr: string, note: string) => {
    lastQr = withAdvSecret(qr, state.creds.advSecretKey);
    opts.onPairing?.({ kind: "qr", qr: lastQr });
    console.log(`\n${note}\n`);
    qrcode.generate(lastQr, { small: true });
  };

  sock.ws.on("CB:notification,type:companion_reg_refresh", (node: { content?: unknown }) => {
    if (state.creds.me || !isRotateRequest(node)) return;
    state.creds.advSecretKey = newAdvSecret(); // same object Baileys verifies pair-success with
    void saveCreds();
    if (lastQr) {
      showQr(
        lastQr,
        '🔄 WhatsApp pidió renovar el código. Si el teléfono dijo "No se pudo vincular", escanea ESTE QR nuevo:',
      );
    }
  });

  let codeRequested = false;
  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr && pairingNumber && !state.creds.registered) {
      // Pairing code instead of QR: request it once per socket (it stays valid while this socket lives).
      if (!codeRequested) {
        codeRequested = true;
        sock
          .requestPairingCode(pairingNumber)
          .then((code) => {
            opts.onPairing?.({ kind: "code", code: formatPairingCode(code) });
            console.log(
              `\n🔑 Código de vinculación: ${formatPairingCode(code)}\n   WhatsApp (número …${pairingNumber.slice(-4)}) → Dispositivos vinculados → Vincular un dispositivo → «Vincular con número de teléfono» → escribe el código.\n`,
            );
          })
          .catch((err) => {
            console.error("[pairing] no se pudo pedir el código; uso QR", err);
            showQr(qr, "Escanea con WhatsApp → Dispositivos vinculados → Vincular dispositivo:");
          });
      }
    } else if (qr) {
      showQr(qr, "Escanea con WhatsApp → Dispositivos vinculados → Vincular dispositivo:");
      // No terminal (server logs): the QR is usually unscannable there — say how to get a code instead.
      if (!process.stdout.isTTY) {
        console.log(
          opts.pairingNumber
            ? `⚠️ SVA_PAIRING_NUMBER="${opts.pairingNumber}" no es un número válido (código de país + número, solo dígitos). Uso QR.`
            : "💡 ¿En un servidor? Define SVA_PAIRING_NUMBER=<tu número con código de país> para vincular con un código en vez de este QR.",
        );
      }
    }
    if (connection === "open") {
      console.log(`✔ Conectado como ${sock.user?.id ?? "?"}`);
      opts.onPairing?.({ kind: "connected", id: sock.user?.id ?? "?" });
      opts.onConnection?.(true, sock);
      onReady(sock);
    }
    if (connection === "close") {
      opts.onConnection?.(false, sock);
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
      if (code === DisconnectReason.loggedOut && !state.creds.registered) {
        // Linking never finished (code/QR expired, or a half-done pairing): there is no real
        // session to protect → wipe the attempt and start a fresh one instead of looping.
        console.warn("↺ La vinculación no se completó o caducó. Empiezo de nuevo con un código/QR nuevo…");
        opts.onPairing?.({ kind: "waiting" });
        void wipeSession(authDir).then(() => setTimeout(() => void connect(opts), 1_000));
        return;
      }
      if (code === DisconnectReason.loggedOut) {
        // The phone removed this device: the session is dead. Wipe it and show a new QR/code
        // (/admin) instead of exiting and restarting into the same dead session forever.
        console.error("✘ Sesión cerrada desde el teléfono. Borro la sesión; vuelve a vincular el bot en /admin.");
        opts.onLoggedOut?.();
        opts.onPairing?.({ kind: "waiting" });
        void wipeSession(authDir).then(() => setTimeout(() => void connect(opts), 1_000));
        return;
      }
      if (code === DisconnectReason.restartRequired) {
        // Expected right after scanning the QR: WhatsApp closes the socket so the
        // client reconnects with the new session. A "failed to ack notification"
        // log just before this is harmless (ack sent on the closing socket).
        console.log("✔ Vinculado. Reiniciando la conexión (normal tras escanear el QR)…");
        void connect(opts);
        return;
      }
      console.warn(`Conexión cerrada (código ${code ?? "?"}). Reconectando…`);
      setTimeout(() => void connect(opts), 2_000);
    }
  });
}
