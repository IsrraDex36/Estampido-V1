import { getContentType, jidNormalizedUser, proto, type WASocket } from "baileys";
import type { FitMode } from "../../config/limits.js";
import { saveCapture } from "./capture.js";
import { isCancel } from "./command.js";
import { HELP_TEXT, isHelp } from "./help.js";
import { extractCode, type LinkStore } from "./links.js";
import { savePackCapture } from "./packCapture.js";
import { takeRawFor } from "./rawCapture.js";
import { describeChat, ignoreReason, isDirectChat, isFresh, SentIds, selfIdsOf, trackOwnSends } from "./routing.js";
import { createSaudio, type SendMode } from "./saudio.js";

export interface BotConfig {
  allowed: ReadonlySet<string>;
  captureDir: string;
  capture: boolean;
  /** Default pack metadata; publisher falls back to the sender's WhatsApp name. */
  metadata?: { packName?: string; publisher?: string };
  /** How to deliver sticker + sound (default native). */
  sendMode?: SendMode;
  /** Default /saudio framing (crop fills the square; pad keeps the whole frame). */
  defaultFit?: FitMode;
  /** Max /saudio per sender per minute (0 = unlimited). */
  ratePerMinute?: number;
  /** Only act on your own messages in your chat with yourself. */
  selfChatOnly?: boolean;
  /** Log every received message and why it is handled/ignored (no content, masked ids). */
  debug?: boolean;
  /** Web ↔ chat links (codes EST-XXXX). Absent → linking disabled. */
  links?: LinkStore;
  /** Delivery signals for the watchdog (message arrived / couldn't be decrypted). */
  onInbound?: (decrypted: boolean) => void;
}

/** WebMessageInfo stub for «message arrived but couldn't be decrypted». */
const CIPHERTEXT = proto.WebMessageInfo.StubType.CIPHERTEXT;

const LINK_REPLY = {
  ok: "✅ ¡Listo! Este chat quedó vinculado a Estampido: ya puedes enviarte stickers con sonido desde la web. Para desvincular, hazlo desde la web.",
  expired: "⌛ Ese código caducó. Genera uno nuevo en la web y vuelve a enviarlo.",
  unknown: "🤔 No reconozco ese código. Genera uno nuevo en la web.",
  rate_limited: "⏳ Demasiados intentos. Espera unos minutos y genera un código nuevo.",
} as const;

function textOf(m: proto.IMessage | null | undefined): string | undefined {
  return (
    m?.conversation ?? m?.extendedTextMessage?.text ?? m?.videoMessage?.caption ?? m?.imageMessage?.caption ?? undefined
  );
}

export function registerHandlers(sock: WASocket, config: BotConfig): void {
  const sent = new SentIds();
  trackOwnSends(sock, sent);
  const saudio = createSaudio(sock, {
    metadata: config.metadata,
    sendMode: config.sendMode,
    defaultFit: config.defaultFit,
    ratePerMinute: config.ratePerMinute,
  });
  const selfIds = selfIdsOf(sock.user);

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    for (const msg of messages) {
      // Watchdog: real-time deliveries prove the link works; CIPHERTEXT stubs = decryption failed.
      if (type === "notify" && !sent.has(msg.key.id)) config.onInbound?.(msg.messageStubType !== CIPHERTEXT);
      // Link codes come from ANY direct chat (that's the point: new users), before the allow-list.
      const code = config.links && !sent.has(msg.key.id) ? extractCode(textOf(msg.message)) : null;
      if (code && config.links && isDirectChat(msg.key.remoteJid) && isFresh({ ...msg, type })) {
        const jid = jidNormalizedUser(msg.key.remoteJid as string);
        try {
          const r = await config.links.redeem(code, jid, jid);
          console.log(`🔗 Código ${r.ok ? "aceptado" : `rechazado (${r.reason})`} · ${describeChat(jid, selfIds)}`);
          await sock.sendMessage(jid, { text: LINK_REPLY[r.ok ? "ok" : r.reason] }, { quoted: msg });
        } catch (err) {
          console.error("[link]", err);
        }
        continue;
      }
      const reason = ignoreReason(
        { ...msg, type },
        { allowed: config.allowed, sent, selfChatOnly: config.selfChatOnly, selfIds },
      );
      const chat = describeChat(msg.key.remoteJid, selfIds);
      if (config.debug) {
        const kind = getContentType(msg.message ?? undefined) ?? "sin contenido (¿no se pudo descifrar?)";
        const cmd = textOf(msg.message)?.trim().startsWith("/")
          ? ` «${textOf(msg.message)?.trim().split(/\s+/)[0]}»`
          : "";
        console.log(
          `· [${type}] ${chat} · ${msg.key.fromMe ? "tuyo" : "de otro"} · ${kind}${cmd} → ${reason ? `ignorado: ${reason}` : "atendido"}`,
        );
      }
      if (reason) {
        takeRawFor(msg.message); // drop any pending raw decode; never persist strangers' data
        continue;
      }

      const raw = takeRawFor(msg.message);
      if (config.capture && raw) {
        try {
          const dir = await saveCapture(config.captureDir, msg, raw);
          console.log(
            `📦 Captura: campos desconocidos [${raw.droppedTopLevel.join(", ") || "anidados"}] (${raw.droppedBytes} B) → ${dir}`,
          );
        } catch (err) {
          console.error("[capture]", err);
        }
      } else if (config.capture) {
        console.log(`· mensaje ${getContentType(msg.message ?? undefined) ?? "vacío"} sin campos desconocidos`);
      }

      if (config.capture && msg.message?.stickerPackMessage) {
        try {
          const { dir, report } = await savePackCapture(config.captureDir, msg);
          console.log(`📦 Pack capturado (${report.stickers} stickers) → ${dir}`);
        } catch (err) {
          console.error("[capture:pack]", err);
        }
      }

      try {
        const text = textOf(msg.message);
        if (await saudio.onAudio(msg)) continue;
        const command = text?.trim().split(/\s+/)[0]?.toLowerCase();
        if (isHelp(text) || isCancel(text) || /^[/!.]saudio$/.test(command ?? ""))
          console.log(`→ ${command} en ${chat}`);
        if (isHelp(text)) await sock.sendMessage(msg.key.remoteJid as string, { text: HELP_TEXT }, { quoted: msg });
        else if (isCancel(text)) await saudio.onCancel(msg);
        else if (text && /^[/!.]saudio\b/i.test(text.trim())) await saudio.onCommand(msg, text);
      } catch (err) {
        console.error("[bot]", err);
      }
    }
  });
}
