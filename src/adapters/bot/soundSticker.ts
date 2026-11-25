import { randomBytes } from "node:crypto";
import { generateMessageIDV2, prepareWAMessageMedia, proto, type WASocket } from "baileys";
import { encodeBytesField } from "../../utils/protobufRaw.js";

/**
 * Native WhatsApp sound sticker (`audioStickerMessage`), reverse-engineered
 * from a real capture (2026-11-25, docs/PROTOCOLO.md):
 *
 *   Message.134 (audioStickerMessage) : FutureProofMessage {
 *     1: Message {
 *       26 stickerMessage: StickerMessage {
 *         …regular sticker fields (url, mediaKey, image/webp, isAnimated…),
 *         25: "🔊"            (new string field)
 *         26: AudioMessage { url, "audio/ogg; codecs=opus", sha256, length,
 *                            seconds, mediaKey, encSha256, directPath, ts }
 *       }
 *     }
 *   }
 *
 * Baileys 7.0.0-rc14's WAProto knows none of 134 / StickerMessage.25 / .26,
 * so they are written as raw protobuf bytes.
 */

export const AUDIO_STICKER_FIELD = 134;
const STICKER_LABEL_FIELD = 25;
const STICKER_AUDIO_FIELD = 26;
const MESSAGE_STICKER_FIELD = 26;
const FUTURE_PROOF_MESSAGE_FIELD = 1;

/** Extra length-delimited fields appended when Baileys encodes a Message. */
export const EXTRA_FIELDS = Symbol.for("sva.extraFields");
type WithExtra = { [EXTRA_FIELDS]?: { field: number; bytes: Uint8Array }[] };

let encodeInstalled = false;

/**
 * Teach `proto.Message.encode` to append raw extra fields carried by a
 * message object. Applies to nested encodes too (Baileys wraps own-device
 * copies in deviceSentMessage, encoded via the same function).
 */
export function installRawEncode(): void {
  if (encodeInstalled) return;
  encodeInstalled = true;
  const original = proto.Message.encode;
  proto.Message.encode = function wrapped(this: unknown, m: proto.IMessage, w?: unknown) {
    const writer = original.call(this, m, w as Parameters<typeof original>[1]);
    const extra = (m as WithExtra | undefined)?.[EXTRA_FIELDS];
    if (extra) for (const { field, bytes } of extra) writer.uint32(((field << 3) | 2) >>> 0).bytes(bytes);
    return writer;
  } as typeof proto.Message.encode;
}

/** Payload of field 134 (a FutureProofMessage), from uploaded sticker + audio. Pure. */
export function buildAudioStickerPayload(
  sticker: proto.Message.IStickerMessage,
  audio: proto.Message.IAudioMessage,
  label = "🔊",
): Buffer {
  const stickerBytes = Buffer.concat([
    Buffer.from(proto.Message.StickerMessage.encode(sticker).finish()),
    encodeBytesField(STICKER_LABEL_FIELD, Buffer.from(label, "utf8")),
    encodeBytesField(STICKER_AUDIO_FIELD, proto.Message.AudioMessage.encode(audio).finish()),
  ]);
  const innerMessage = encodeBytesField(MESSAGE_STICKER_FIELD, stickerBytes);
  return encodeBytesField(FUTURE_PROOF_MESSAGE_FIELD, innerMessage);
}

/**
 * Message object for relayMessage: field 134 as raw extra bytes, plus a
 * `stickerMessage` on the *prototype* so Baileys' getMediaType() tags the
 * stanza `mediatype="sticker"` (without it the server drops the message),
 * while the encoder — which only writes own properties — doesn't emit a
 * duplicate plain sticker.
 */
export function makeAudioStickerMessage(payload: Uint8Array): proto.IMessage {
  const msg = Object.create({ stickerMessage: {} }) as proto.IMessage & WithExtra;
  msg.messageContextInfo = { messageSecret: randomBytes(32) };
  msg[EXTRA_FIELDS] = [{ field: AUDIO_STICKER_FIELD, bytes: payload }];
  return msg;
}

export interface SoundStickerInput {
  webpPath: string;
  audioPath: string;
  audioDurationSec: number;
  animated: boolean;
}

/** Upload sticker + audio and relay one native sound sticker. Returns the message id. */
export async function sendSoundSticker(sock: WASocket, jid: string, input: SoundStickerInput): Promise<string> {
  installRawEncode();
  const upload = { upload: sock.waUploadToServer };

  const { stickerMessage } = await prepareWAMessageMedia({ sticker: { url: input.webpPath } }, upload);
  const { audioMessage } = await prepareWAMessageMedia(
    {
      audio: { url: input.audioPath },
      mimetype: "audio/ogg; codecs=opus",
      seconds: Math.round(input.audioDurationSec),
    },
    upload,
  );
  if (!stickerMessage || !audioMessage) throw new Error("media upload failed");

  // Mirror the real client: animated flag, 64×64 display hint, plain audio (no ptt/waveform).
  stickerMessage.isAnimated = input.animated;
  stickerMessage.height = 64;
  stickerMessage.width = 64;
  audioMessage.ptt = undefined;
  audioMessage.waveform = undefined;
  audioMessage.seconds = Math.max(1, Math.round(input.audioDurationSec));

  const messageId = generateMessageIDV2(sock.user?.id);
  const message = makeAudioStickerMessage(buildAudioStickerPayload(stickerMessage, audioMessage));
  await sock.relayMessage(jid, message, { messageId });
  return messageId;
}
