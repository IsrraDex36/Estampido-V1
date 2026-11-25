import makeWASocket, { Browsers, DisconnectReason, useMultiFileAuthState, type WASocket } from "baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { isRotateRequest, newAdvSecret, resolveWaVersion, withAdvSecret } from "./pairing.js";

export interface ConnectOptions {
  /** Auth state folder. Contains session keys → never commit. */
  authDir: string;
  onReady: (sock: WASocket) => void;
  logLevel?: string;
}

/** Connect with QR login and auto-reconnect (except on logout). */
export async function connect({ authDir, onReady, logLevel = "warn" }: ConnectOptions): Promise<void> {
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
  });

  sock.ev.on("creds.update", saveCreds);

  // Always render the QR with the *current* ADV secret (it may be rotated below).
  let lastQr: string | undefined;
  const showQr = (qr: string, note: string) => {
    lastQr = withAdvSecret(qr, state.creds.advSecretKey);
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

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) showQr(qr, "Escanea con WhatsApp → Dispositivos vinculados → Vincular dispositivo:");
    if (connection === "open") {
      console.log(`✔ Conectado como ${sock.user?.id ?? "?"}`);
      onReady(sock);
    }
    if (connection === "close") {
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.error(`✘ Sesión cerrada. Borra ${authDir} y vuelve a vincular.`);
        process.exit(1);
      }
      if (code === DisconnectReason.restartRequired) {
        // Expected right after scanning the QR: WhatsApp closes the socket so the
        // client reconnects with the new session. A "failed to ack notification"
        // log just before this is harmless (ack sent on the closing socket).
        console.log("✔ Vinculado. Reiniciando la conexión (normal tras escanear el QR)…");
        void connect({ authDir, onReady, logLevel });
        return;
      }
      console.warn(`Conexión cerrada (código ${code ?? "?"}). Reconectando…`);
      setTimeout(() => void connect({ authDir, onReady, logLevel }), 2_000);
    }
  });
}
