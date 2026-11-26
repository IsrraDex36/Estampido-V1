import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WAMessage, WASocket } from "baileys";
import { type FitMode, INPUT_LIMITS, STICKER_LIMITS } from "../../config/limits.js";
import { CancelledError, UserInputError } from "../../core/errors.js";
import { type ConvertResult, convertToSoundSticker, type ReplacementAudio } from "../../pipeline/convert.js";
import { RateLimiter } from "../../utils/rateLimit.js";
import { Semaphore } from "../../utils/semaphore.js";
import { parseSaudio, SAUDIO_USAGE, type SaudioCommand } from "./command.js";
import { type Humanizer, humanizer, replyLikeHuman, say } from "./humanize.js";
import { type Downloader, downloadLimited, mediaOf } from "./media.js";
import { PendingAudioStore, senderKey } from "./pending.js";
import { fill, PHRASES } from "./phrases.js";
import { sendSoundSticker } from "./soundSticker.js";
import { StatusMessage } from "./status.js";
import { type Delivery, formatSummary } from "./summary.js";

/**
 * native: one real sound sticker (field 134, from the 2026-11-25 capture).
 * fallback: sticker + separate voice note. both: send both (to compare).
 */
export type SendMode = "native" | "fallback" | "both";

export const BOT_TMP_PREFIX = "sva-bot-";

export interface SaudioOptions {
  /** Human-like pacing and wording (default: the process-wide one). */
  humanizer?: Humanizer;
  download?: Downloader;
  metadata?: { packName?: string; publisher?: string };
  sendMode?: SendMode;
  /** Default framing when the user doesn't say pad/crop. */
  defaultFit?: FitMode;
  /** Max /saudio per sender per minute (0 = unlimited). */
  ratePerMinute?: number;
  /** Concurrent conversions (shared queue). */
  concurrency?: number;
}

const userMessage = (err: unknown): string =>
  err instanceof UserInputError || (err instanceof Error && err.message.startsWith("Argumento"))
    ? err.message
    : "No pude convertir eso 😕";

/**
 * `/saudio` flow. Video → sticker + its own sound. With `voz`, or for sources
 * without sound (image, sticker, WhatsApp GIF), the media is downloaded now
 * and the next voice note/audio from the same sender becomes the sound.
 * Progress is a single edited status message; /cancelar stops pending,
 * queued and running jobs.
 */
export function createSaudio(sock: WASocket, opts: SaudioOptions = {}) {
  const { download, metadata = {}, sendMode = "native", defaultFit = "crop" } = opts;
  const jobs = new Semaphore(opts.concurrency ?? 1);
  const limiter = opts.ratePerMinute ? new RateLimiter(opts.ratePerMinute) : null;
  /** Running or queued conversions, per sender. */
  const active = new Map<string, AbortController>();
  /** Status message of a job waiting for a voice note, per sender. */
  const waitingStatus = new Map<string, StatusMessage>();

  const pending = new PendingAudioStore(undefined, (key) => {
    const status = waitingStatus.get(key);
    waitingStatus.delete(key);
    void status?.set("⌛ Se acabó el tiempo para enviar el audio. Repite /saudio voz.");
  });

  const h = opts.humanizer ?? humanizer;
  const reply = (to: WAMessage, text: string) =>
    replyLikeHuman(sock, to.key.remoteJid as string, text, { quoted: to, read: to.key, h });
  /** A variant of a status line for this chat. */
  const line = (to: WAMessage, kind: "downloading" | "creating" | "receivingAudio" | "tooFast", values = {}) =>
    fill(say(kind, to.key.remoteJid as string, PHRASES[kind], h), values);
  const react = (to: WAMessage, text: string) =>
    sock.sendMessage(to.key.remoteJid as string, { react: { text, key: to.key } });

  async function convertAndSend(
    origin: WAMessage,
    status: StatusMessage,
    dir: string,
    inputPath: string,
    cmd: SaudioCommand,
    audio: "source" | ReplacementAudio,
    loops: boolean,
  ): Promise<void> {
    const key = senderKey(origin.key);
    const controller = new AbortController();
    active.set(key, controller);
    try {
      const { customAudio: _c, hq, ...segment } = cmd;
      const result = await jobs.run(
        async () => {
          await status.set(line(origin, "creating"), { essential: false });
          return convertToSoundSticker({
            input: inputPath,
            outDir: dir,
            name: "sticker",
            ...segment,
            audio,
            loops,
            signal: controller.signal,
            maxBytes: hq ? STICKER_LIMITS.experimentalMaxBytes : undefined,
            // No duration typed → whole video / whole voice note (up to the max).
            fullLength: segment.durationSec === undefined,
            metadata: {
              packName: metadata.packName,
              // Sender's WhatsApp display name, so "author" shows who made it.
              publisher: metadata.publisher ?? origin.pushName ?? undefined,
            },
          });
        },
        {
          signal: controller.signal,
          onQueued: (position) =>
            void status.set(`🕒 En cola · ${position === 1 ? "eres el siguiente" : `posición ${position}`}`, {
              essential: false,
            }),
        },
      );
      const delivery = await deliver(origin, result);
      await status.set(formatSummary(result, delivery));
      await react(origin, "✅");
    } finally {
      if (active.get(key) === controller) active.delete(key);
    }
  }

  /** Native sound sticker when possible; separate sticker + voice note otherwise. */
  async function deliver(origin: WAMessage, result: ConvertResult): Promise<Delivery> {
    const jid = origin.key.remoteJid as string;
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
    if (!result.audioPath || !result.stats.audio) {
      await sendSeparate();
      return "sticker-only";
    }
    if (sendMode === "fallback") {
      await sendSeparate();
      return "separate";
    }
    try {
      await sendSoundSticker(sock, jid, {
        webpPath: result.webpPath,
        audioPath: result.audioPath,
        audioDurationSec: result.stats.audio.durationSec,
        animated: result.stats.sticker.animated,
      });
      if (sendMode === "both") await sendSeparate();
      return "native";
    } catch (err) {
      console.error("[saudio:native] falló el envío nativo; uso el separado", err);
      await sendSeparate();
      return "separate-fallback";
    }
  }

  async function fail(origin: WAMessage, status: StatusMessage, err: unknown): Promise<void> {
    if (err instanceof CancelledError) {
      await status.set("🛑 Cancelado.");
      return;
    }
    console.error("[saudio]", err);
    await status.set(`❌ ${userMessage(err)}`);
    await react(origin, "❌");
  }

  /** Handle a `/saudio …` message. */
  async function onCommand(msg: WAMessage, text: string): Promise<void> {
    let cmd: SaudioCommand | null;
    try {
      cmd = parseSaudio(text, undefined, defaultFit);
    } catch (err) {
      await reply(msg, userMessage(err));
      return;
    }
    if (!cmd) return;

    const media = mediaOf(msg.message);
    if (!media) {
      await reply(
        msg,
        `Envía un video, GIF, imagen o sticker con /saudio, o responde a uno.\n${SAUDIO_USAGE}\n/ayuda para más.`,
      );
      return;
    }

    const key = senderKey(msg.key);
    const waitMs = limiter?.take(key) ?? 0;
    if (waitMs > 0) {
      await reply(msg, line(msg, "tooFast", { s: Math.ceil(waitMs / 1000) }));
      return;
    }

    const status = new StatusMessage(sock, msg, h);
    await status.set(line(msg, "downloading", { what: media.label.toLowerCase() }));
    const dir = await mkdtemp(join(tmpdir(), BOT_TMP_PREFIX));
    let handedOff = false;
    try {
      const inputPath = join(dir, "input");
      await writeFile(
        inputPath,
        await downloadLimited(media.message, media.type, INPUT_LIMITS.maxVideoBytes, media.label, download),
      );

      if (cmd.customAudio || media.silent) {
        await pending.set(key, { dir, inputPath, cmd, origin: msg, loops: media.loops });
        waitingStatus.set(key, status);
        handedOff = true;
        const why = cmd.customAudio ? "🎙️" : `🎙️ ${media.label} no tiene sonido.`;
        await status.set(
          `${why} Envía ahora una nota de voz o un audio (máx. ${INPUT_LIMITS.maxAudioBytes / 1024 / 1024} MB) en los próximos ${pending.ttlMs / 60000} min. /cancelar para cancelar.`,
        );
        return;
      }
      await convertAndSend(msg, status, dir, inputPath, cmd, "source", false);
    } catch (err) {
      await fail(msg, status, err);
    } finally {
      if (!handedOff) await rm(dir, { recursive: true, force: true });
    }
  }

  /** Audio from a sender with a pending `/saudio voz`. Returns true if consumed. */
  async function onAudio(msg: WAMessage): Promise<boolean> {
    const audio = msg.message?.audioMessage;
    if (!audio) return false;
    const key = senderKey(msg.key);
    const job = pending.take(key);
    if (!job) return false;
    const status = waitingStatus.get(key) ?? new StatusMessage(sock, job.origin, h);
    waitingStatus.delete(key);

    try {
      await status.set(line(msg, "receivingAudio"));
      const audioPath = join(job.dir, "audio-input");
      await writeFile(
        audioPath,
        await downloadLimited(audio, "audio", INPUT_LIMITS.maxAudioBytes, "El audio", download),
      );
      await convertAndSend(
        job.origin,
        status,
        job.dir,
        job.inputPath,
        job.cmd,
        { file: audioPath },
        job.loops ?? false,
      );
    } catch (err) {
      await fail(job.origin, status, err);
    } finally {
      await rm(job.dir, { recursive: true, force: true });
    }
    return true;
  }

  /** Cancels a pending voice-note wait and/or a queued/running conversion. */
  async function onCancel(msg: WAMessage): Promise<void> {
    const key = senderKey(msg.key);
    const hadPending = await pending.discard(key);
    const waiting = waitingStatus.get(key);
    waitingStatus.delete(key);
    if (hadPending) await waiting?.set("🛑 Cancelado.");
    const running = active.get(key);
    running?.abort();
    await reply(msg, hadPending || running ? "Cancelado." : "No hay nada en curso.");
  }

  return { onCommand, onAudio, onCancel, pending, jobs };
}
