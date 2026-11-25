import { getContentType, type proto, type WASocket } from "baileys";
import type { FitMode } from "../../config/limits.js";
import { saveCapture } from "./capture.js";
import { isCancel } from "./command.js";
import { HELP_TEXT, isHelp } from "./help.js";
import { takeRawFor } from "./rawCapture.js";
import { SentIds, selfIdsOf, shouldHandle, trackOwnSends } from "./routing.js";
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
}

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
      if (
        !shouldHandle({ ...msg, type }, { allowed: config.allowed, sent, selfChatOnly: config.selfChatOnly, selfIds })
      ) {
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

      try {
        const text = textOf(msg.message);
        if (await saudio.onAudio(msg)) continue;
        if (isHelp(text)) await sock.sendMessage(msg.key.remoteJid as string, { text: HELP_TEXT }, { quoted: msg });
        else if (isCancel(text)) await saudio.onCancel(msg);
        else if (text && /^[/!.]saudio\b/i.test(text.trim())) await saudio.onCommand(msg, text);
      } catch (err) {
        console.error("[bot]", err);
      }
    }
  });
}
