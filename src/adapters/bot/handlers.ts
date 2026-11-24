import { getContentType, type proto, type WASocket } from "baileys";
import { saveCapture } from "./capture.js";
import { isCancel } from "./command.js";
import { takeRawFor } from "./rawCapture.js";
import { SentIds, shouldHandle, trackOwnSends } from "./routing.js";
import { createSaudio } from "./saudio.js";

export interface BotConfig {
  allowed: ReadonlySet<string>;
  captureDir: string;
  capture: boolean;
  /** Default pack metadata; publisher falls back to the sender's WhatsApp name. */
  metadata?: { packName?: string; publisher?: string };
}

function textOf(m: proto.IMessage | null | undefined): string | undefined {
  return (
    m?.conversation ?? m?.extendedTextMessage?.text ?? m?.videoMessage?.caption ?? m?.imageMessage?.caption ?? undefined
  );
}

export function registerHandlers(sock: WASocket, config: BotConfig): void {
  const sent = new SentIds();
  trackOwnSends(sock, sent);
  const saudio = createSaudio(sock, undefined, config.metadata);

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    for (const msg of messages) {
      if (!shouldHandle({ ...msg, type }, { allowed: config.allowed, sent })) {
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
        if (isCancel(text)) await saudio.onCancel(msg);
        else if (text && /^[/!.]saudio\b/i.test(text.trim())) await saudio.onCommand(msg, text);
      } catch (err) {
        console.error("[bot]", err);
      }
    }
  });
}
