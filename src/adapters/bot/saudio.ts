import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { proto, WAMessage, WASocket } from "baileys";
import { INPUT_LIMITS } from "../../config/limits.js";
import { UserInputError } from "../../core/errors.js";
import {
  convertVideoToSoundSticker,
  type ReplacementAudio,
} from "../../pipeline/convert.js";
import { Semaphore } from "../../utils/semaphore.js";
import { parseSaudio, SAUDIO_USAGE, type SaudioCommand } from "./command.js";
import { type Downloader, downloadLimited } from "./media.js";
import { PendingAudioStore, senderKey } from "./pending.js";

const jobs = new Semaphore(1);

/** The video to convert: the message itself, or the one it quotes. */
export function videoOf(
  m: proto.IMessage | null | undefined,
): proto.Message.IVideoMessage | undefined {
  return (
    m?.videoMessage ??
    m?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage ??
    undefined
  );
}

const userMessage = (err: unknown): string =>
  err instanceof UserInputError ||
  (err instanceof Error && err.message.startsWith("Argumento"))
    ? err.message
    : "No pude convertir ese video 😕";

/**
 * `/saudio` flow. Plain: video → sticker + its own sound. With `voz`: the
 * video is downloaded now and the next voice note/audio from the same sender
 * (within the TTL) becomes the sticker's sound.
 */
export function createSaudio(sock: WASocket, download?: Downloader) {
  const pending = new PendingAudioStore(undefined, (key) => {
    const jid = key.split("|")[0];
    if (jid)
      void sock.sendMessage(jid, {
        text: "⌛ Se acabó el tiempo para enviar el audio. Repite /saudio voz.",
      });
  });

  const reply = (to: WAMessage, text: string) =>
    sock.sendMessage(to.key.remoteJid as string, { text }, { quoted: to });
  const react = (to: WAMessage, text: string) =>
    sock.sendMessage(to.key.remoteJid as string, {
      react: { text, key: to.key },
    });

  async function convertAndSend(
    origin: WAMessage,
    dir: string,
    videoPath: string,
    cmd: SaudioCommand,
    audio: "source" | ReplacementAudio,
  ): Promise<void> {
    const jid = origin.key.remoteJid as string;
    const { customAudio: _c, ...segment } = cmd;
    const result = await jobs.run(() =>
      convertVideoToSoundSticker({
        input: videoPath,
        outDir: dir,
        name: "sticker",
        ...segment,
        audio,
      }),
    );

    // Fallback delivery (works today): sticker + voice note. Native sound
    // sticker (field 134) pending capture analysis — see docs/PROTOCOLO.md.
    await sock.sendMessage(
      jid,
      { sticker: { url: result.webpPath } },
      { quoted: origin },
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
      origin,
      `✔ ${(s.bytes / 1024).toFixed(0)} KB · ${s.fps} fps · q${s.quality} · ${(s.durationMs / 1000).toFixed(1)} s${notes}`,
    );
    await react(origin, "✅");
  }

  /** Handle a `/saudio …` message. */
  async function onCommand(msg: WAMessage, text: string): Promise<void> {
    let cmd: SaudioCommand | null;
    try {
      cmd = parseSaudio(text);
    } catch (err) {
      await reply(msg, userMessage(err));
      return;
    }
    if (!cmd) return;

    const video = videoOf(msg.message);
    if (!video) {
      await reply(
        msg,
        `Envía un video con el texto /saudio, o responde a un video. ${SAUDIO_USAGE}`,
      );
      return;
    }

    await react(msg, "⏳");
    const dir = await mkdtemp(join(tmpdir(), "sva-bot-"));
    let handedOff = false;
    try {
      const videoPath = join(dir, "input");
      await writeFile(
        videoPath,
        await downloadLimited(
          video,
          "video",
          INPUT_LIMITS.maxVideoBytes,
          "El video",
          download,
        ),
      );

      if (cmd.customAudio) {
        await pending.set(senderKey(msg.key), {
          dir,
          videoPath,
          cmd,
          origin: msg,
        });
        handedOff = true;
        await reply(
          msg,
          `🎙️ Ahora envía una nota de voz o un audio (máx. ${INPUT_LIMITS.maxAudioBytes / 1024 / 1024} MB) en los próximos ${pending.ttlMs / 60000} min. /cancelar para cancelar.`,
        );
        return;
      }
      await convertAndSend(msg, dir, videoPath, cmd, "source");
    } catch (err) {
      console.error("[saudio]", err);
      await reply(msg, userMessage(err));
      await react(msg, "❌");
    } finally {
      if (!handedOff) await rm(dir, { recursive: true, force: true });
    }
  }

  /** Audio from a sender with a pending `/saudio voz`. Returns true if consumed. */
  async function onAudio(msg: WAMessage): Promise<boolean> {
    const audio = msg.message?.audioMessage;
    if (!audio) return false;
    const job = pending.take(senderKey(msg.key));
    if (!job) return false;

    await react(msg, "⏳");
    try {
      const audioPath = join(job.dir, "audio-input");
      await writeFile(
        audioPath,
        await downloadLimited(
          audio,
          "audio",
          INPUT_LIMITS.maxAudioBytes,
          "El audio",
          download,
        ),
      );
      await convertAndSend(job.origin, job.dir, job.videoPath, job.cmd, {
        file: audioPath,
      });
      await react(msg, "✅");
    } catch (err) {
      console.error("[saudio:voz]", err);
      await reply(msg, userMessage(err));
      await react(msg, "❌");
    } finally {
      await rm(job.dir, { recursive: true, force: true });
    }
    return true;
  }

  async function onCancel(msg: WAMessage): Promise<void> {
    const had = await pending.discard(senderKey(msg.key));
    await reply(msg, had ? "Cancelado." : "No hay nada pendiente.");
  }

  return { onCommand, onAudio, onCancel, pending };
}
