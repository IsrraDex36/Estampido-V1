import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
} from "baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";

export interface ConnectOptions {
  /** Auth state folder. Contains session keys → never commit. */
  authDir: string;
  onReady: (sock: WASocket) => void;
  logLevel?: string;
}

/** Connect with QR login and auto-reconnect (except on logout). */
export async function connect({
  authDir,
  onReady,
  logLevel = "warn",
}: ConnectOptions): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({
    version: undefined,
  }));

  const sock = makeWASocket({
    auth: state,
    version,
    browser: Browsers.macOS("Desktop"),
    logger: pino({ level: logLevel }),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log(
        "\nEscanea con WhatsApp → Dispositivos vinculados → Vincular dispositivo:\n",
      );
      qrcode.generate(qr, { small: true });
    }
    if (connection === "open") {
      console.log(`✔ Conectado como ${sock.user?.id ?? "?"}`);
      onReady(sock);
    }
    if (connection === "close") {
      const code = (
        lastDisconnect?.error as
          | { output?: { statusCode?: number } }
          | undefined
      )?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.error(
          `✘ Sesión cerrada. Borra ${authDir} y vuelve a vincular.`,
        );
        process.exit(1);
      }
      console.warn(`Conexión cerrada (código ${code ?? "?"}). Reconectando…`);
      setTimeout(() => void connect({ authDir, onReady, logLevel }), 2_000);
    }
  });
}
