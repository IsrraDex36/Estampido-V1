import { resolve } from "node:path";
import { connect } from "./connection.js";
import { registerHandlers } from "./handlers.js";
import { installRawCapture } from "./rawCapture.js";
import type { SendMode } from "./saudio.js";
import { installRawEncode } from "./soundSticker.js";

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

console.log(
  `Bot SVA · envío ${sendMode} · captura ${capture ? "ON" : "OFF"} · remitentes permitidos: ${allowed.size || "solo tú (fromMe)"}`,
);

await connect({
  authDir: resolve(process.env.SVA_AUTH_DIR ?? ".auth"),
  logLevel: process.env.SVA_LOG ?? "warn",
  onReady: (sock) =>
    registerHandlers(sock, {
      allowed,
      capture,
      captureDir: resolve("captures"),
      sendMode,
      metadata: { packName: process.env.SVA_PACK || undefined, publisher: process.env.SVA_AUTHOR || undefined },
    }),
});
