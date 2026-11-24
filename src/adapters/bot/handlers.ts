import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  downloadContentFromMessage,
  getContentType,
  type proto,
  type WAMessage,
  type WASocket,
} from "baileys";
import { convertVideoToSoundSticker } from "../../pipeline/convert.js";
import { Semaphore } from "../../utils/semaphore.js";
import { saveCapture } from "./capture.js";
import { isAllowedSender, parseSaudio } from "./command.js";
import { takeRawFor } from "./rawCapture.js";

export interface BotConfig {
  allowed: ReadonlySet<string>;
  captureDir: string;
  capture: boolean;
}

const jobs = new Semaphore(1);

function textOf(m: proto.IMessage | null | undefined): string | undefined {
  return (
    m?.conversation ??
    m?.extendedTextMessage?.text ??
    m?.videoMessage?.caption ??
    undefined
  );
}

/** The video to convert: the message itself, or the one it quotes. */
function videoOf(
  m: proto.IMessage | null | undefined,
): proto.Message.IVideoMessage | undefined {
  return (
    m?.videoMessage ??
    m?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage ??
    undefined
  );
}

async function downloadVideo(
  video: proto.Message.IVideoMessage,
): Promise<Buffer> {
  const stream = await downloadContentFromMessage(video, "video");
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

async function handleSaudio(
  sock: WASocket,
  msg: WAMessage,
  text: string,
): Promise<void> {
  const jid = msg.key.remoteJid as string;
  const reply = (t: string) =>
    sock.sendMessage(jid, { text: t }, { quoted: msg });

  let cmd: ReturnType<typeof parseSaudio>;
  try {
    cmd = parseSaudio(text);
  } catch (err) {
    await reply((err as Error).message);
    return;
  }
  if (!cmd) return;

  const video = videoOf(msg.message);
  if (!video) {
    await reply(
      "Envía un video con el texto /saudio, o responde a un video con /saudio [inicio] [duración] [crop|pad].",
    );
    return;
  }

  await sock.sendMessage(jid, { react: { text: "⏳", key: msg.key } });
  const dir = await mkdtemp(join(tmpdir(), "sva-bot-"));
  try {
    const input = join(dir, "input");
    await writeFile(input, await downloadVideo(video));
    const result = await jobs.run(() =>
      convertVideoToSoundSticker({
        input,
        outDir: dir,
        name: "sticker",
        ...cmd,
        audio: "source",
      }),
    );

    // Fallback delivery (works today): sticker + voice note. Native sound
    // sticker (field 134) pending capture analysis — see docs/PROTOCOLO.md.
    await sock.sendMessage(
      jid,
      { sticker: { url: result.webpPath } },
      { quoted: msg },
    );
    if (result.audioPath) {
      await sock.sendMessage(jid, {
        audio: { url: result.audioPath },
        mimetype: "audio/ogg; codecs=opus",
        ptt: true,
      });
    }
    const s = result.stats.sticker;
    const notes = result.warnings.length
      ? `\n⚠️ ${result.warnings.join("\n⚠️ ")}`
      : "";
    await reply(
      `✔ ${(s.bytes / 1024).toFixed(0)} KB · ${s.fps} fps · q${s.quality} · ${(s.durationMs / 1000).toFixed(1)} s${notes}`,
    );
    await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });
  } catch (err) {
    console.error("[saudio]", err);
    await reply("No pude convertir ese video 😕");
    await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function registerHandlers(sock: WASocket, config: BotConfig): void {
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      if (!isAllowedSender(msg.key, config.allowed)) {
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
        console.log(
          `· mensaje ${getContentType(msg.message ?? undefined) ?? "vacío"} sin campos desconocidos`,
        );
      }

      const text = textOf(msg.message);
      if (text && /^[/!.]saudio\b/i.test(text.trim())) {
        await handleSaudio(sock, msg, text).catch((e) =>
          console.error("[saudio]", e),
        );
      }
    }
  });
}
