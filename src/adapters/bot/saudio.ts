import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WAMessage, WASocket } from "baileys";
import { INPUT_LIMITS } from "../../config/limits.js";
import { UserInputError } from "../../core/errors.js";
import { convertToSoundSticker, type ReplacementAudio } from "../../pipeline/convert.js";
import { Semaphore } from "../../utils/semaphore.js";
import { parseSaudio, SAUDIO_USAGE, type SaudioCommand } from "./command.js";
import { type Downloader, downloadLimited, mediaOf } from "./media.js";
import { PendingAudioStore, senderKey } from "./pending.js";
import { sendSoundSticker } from "./soundSticker.js";

/**
 * native: one real sound sticker (field 134, from the 2026-11-25 capture).
 * fallback: sticker + separate voice note. both: send both (to compare).
 */
export type SendMode = "native" | "fallback" | "both";

const jobs = new Semaphore(1);

const userMessage = (err: unknown): string =>
  err instanceof UserInputError || (err instanceof Error && err.message.startsWith("Argumento"))
    ? err.message
    : "No pude convertir eso 😕";

/**
 * `/saudio` flow. Video → sticker + its own sound. With `voz`, or for sources
 * without sound (image, sticker, WhatsApp GIF), the media is downloaded now
 * and the next voice note/audio from the same sender (within the TTL)
 * becomes the sticker's sound.
 */
export function createSaudio(
  sock: WASocket,
  download?: Downloader,
  metadataDefaults: { packName?: string; publisher?: string } = {},
  sendMode: SendMode = "native",
) {
  const pending = new PendingAudioStore(undefined, (key) => {
    const jid = key.split("|")[0];
    if (jid)
      void sock.sendMessage(jid, {
        text: "⌛ Se acabó el tiempo para enviar el audio. Repite /saudio voz.",
      });
  });

  const reply = (to: WAMessage, text: string) => sock.sendMessage(to.key.remoteJid as string, { text }, { quoted: to });
  const react = (to: WAMessage, text: string) =>
    sock.sendMessage(to.key.remoteJid as string, {
      react: { text, key: to.key },
    });

  async function convertAndSend(
    origin: WAMessage,
    dir: string,
    inputPath: string,
    cmd: SaudioCommand,
    audio: "source" | ReplacementAudio,
    loops = false,
  ): Promise<void> {
    const jid = origin.key.remoteJid as string;
    const { customAudio: _c, ...segment } = cmd;
    const result = await jobs.run(() =>
      convertToSoundSticker({
        input: inputPath,
        outDir: dir,
        name: "sticker",
        ...segment,
        audio,
        loops,
        metadata: {
          packName: metadataDefaults.packName,
          // Sender's WhatsApp display name, so "author" shows who made it.
          publisher: metadataDefaults.publisher ?? origin.pushName ?? undefined,
        },
      }),
    );

    let delivered = "separado";
    const sendSeparate = async () => {
      await sock.sendMessage(jid, { sticker: { url: result.webpPath } }, { quoted: origin });
      if (result.audioPath) {
        await sock.sendMessage(jid, {
          audio: { url: result.audioPath },
          mimetype: "audio/ogg; codecs=opus",
          ptt: true,
        });
      }
    };
    if (result.audioPath && result.stats.audio && sendMode !== "fallback") {
      try {
        await sendSoundSticker(sock, jid, {
          webpPath: result.webpPath,
          audioPath: result.audioPath,
          audioDurationSec: result.stats.audio.durationSec,
          animated: result.stats.sticker.animated,
        });
        delivered = "nativo 🔊";
        if (sendMode === "both") await sendSeparate();
      } catch (err) {
        console.error("[saudio:native] falló el envío nativo; uso el separado", err);
        delivered = "separado (falló el nativo)";
        await sendSeparate();
      }
    } else {
      await sendSeparate();
    }
    const s = result.stats.sticker;
    const notes = result.warnings.length ? `\n⚠️ ${result.warnings.join("\n⚠️ ")}` : "";
    const shape = s.animated ? `${s.fps} fps · ${(s.durationMs / 1000).toFixed(1)} s` : "estático";
    const sound = result.stats.audio ? ` · 🔊 ${result.stats.audio.durationSec.toFixed(1)} s` : "";
    await reply(
      origin,
      `✔ ${(s.bytes / 1024).toFixed(0)} KB · ${shape} · q${s.quality}${sound} · ${delivered}${notes}`,
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

    const media = mediaOf(msg.message);
    if (!media) {
      await reply(msg, `Envía un video, GIF, imagen o sticker con /saudio, o responde a uno. ${SAUDIO_USAGE}`);
      return;
    }

    await react(msg, "⏳");
    const dir = await mkdtemp(join(tmpdir(), "sva-bot-"));
    let handedOff = false;
    try {
      const inputPath = join(dir, "input");
      await writeFile(
        inputPath,
        await downloadLimited(media.message, media.type, INPUT_LIMITS.maxVideoBytes, media.label, download),
      );

      if (cmd.customAudio || media.silent) {
        await pending.set(senderKey(msg.key), { dir, inputPath, cmd, origin: msg, loops: media.loops });
        handedOff = true;
        const why = cmd.customAudio ? "🎙️" : `🎙️ ${media.label} no tiene sonido.`;
        await reply(
          msg,
          `${why} Envía ahora una nota de voz o un audio (máx. ${INPUT_LIMITS.maxAudioBytes / 1024 / 1024} MB) en los próximos ${pending.ttlMs / 60000} min. /cancelar para cancelar.`,
        );
        return;
      }
      await convertAndSend(msg, dir, inputPath, cmd, "source");
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
        await downloadLimited(audio, "audio", INPUT_LIMITS.maxAudioBytes, "El audio", download),
      );
      await convertAndSend(job.origin, job.dir, job.inputPath, job.cmd, { file: audioPath }, job.loops);
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
