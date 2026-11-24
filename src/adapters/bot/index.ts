import { resolve } from "node:path";
import { connect } from "./connection.js";
import { registerHandlers } from "./handlers.js";
import { installRawCapture } from "./rawCapture.js";

/**
 * WhatsApp bot (Baileys, unofficial → use a secondary number).
 *
 *   SVA_ALLOWED=595981234567,5215512345678 npm run bot          # /saudio
 *   SVA_ALLOWED=... npm run bot -- --capture                     # + reverse-engineering dumps
 */
const capture = process.argv.includes("--capture");
const allowed = new Set(
  (process.env.SVA_ALLOWED ?? "")
    .split(",")
    .map((s) => s.replace(/\D/g, ""))
    .filter(Boolean),
);

installRawCapture();

console.log(
  `Bot SVA · captura ${capture ? "ON" : "OFF"} · remitentes permitidos: ${allowed.size || "solo tú (fromMe)"}`,
);

await connect({
  authDir: resolve(process.env.SVA_AUTH_DIR ?? ".auth"),
  logLevel: process.env.SVA_LOG ?? "warn",
  onReady: (sock) =>
    registerHandlers(sock, {
      allowed,
      capture,
      captureDir: resolve("captures"),
    }),
});
