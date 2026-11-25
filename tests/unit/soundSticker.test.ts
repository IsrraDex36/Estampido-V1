import { proto } from "baileys";
import { describe, expect, it } from "vitest";
import {
  AUDIO_STICKER_FIELD,
  buildAudioStickerPayload,
  installRawEncode,
  makeAudioStickerMessage,
} from "../../src/adapters/bot/soundSticker.js";
import { decodeRaw, fieldNumbers } from "../../src/utils/protobufRaw.js";

const k = Buffer.alloc(32, 7);
const sticker = { url: "https://mmg.whatsapp.net/s", mediaKey: k, mimetype: "image/webp", isAnimated: true };
const audio = { url: "https://mmg.whatsapp.net/a", mediaKey: k, mimetype: "audio/ogg; codecs=opus", seconds: 5 };

/** Follow length-delimited fields by number. */
const dig = (buf: Buffer, ...path: number[]): Buffer => {
  let cur = buf;
  for (const f of path) {
    const hit = decodeRaw(cur).find((x) => x.field === f && x.wire === 2);
    if (!hit) throw new Error(`no field ${f}`);
    cur = hit.value as Buffer;
  }
  return cur;
};

describe("buildAudioStickerPayload (layout from the real capture)", () => {
  const payload = buildAudioStickerPayload(sticker, audio);

  it("FutureProof.1 → Message.26 (sticker) → .25 label + .26 AudioMessage", () => {
    const stickerBytes = dig(payload, 1, 26);
    expect(proto.Message.StickerMessage.decode(stickerBytes)).toMatchObject({
      mimetype: "image/webp",
      isAnimated: true,
    });
    expect(dig(payload, 1, 26, 25).toString()).toBe("🔊");
    const decodedAudio = proto.Message.AudioMessage.decode(dig(payload, 1, 26, 26));
    expect(decodedAudio).toMatchObject({ mimetype: "audio/ogg; codecs=opus", seconds: 5 });
    expect(Buffer.from(decodedAudio.mediaKey as Uint8Array).equals(k)).toBe(true);
  });
});

describe("makeAudioStickerMessage + installRawEncode", () => {
  installRawEncode();
  const payload = buildAudioStickerPayload(sticker, audio);
  const msg = makeAudioStickerMessage(payload);

  it("Baileys sees a sticker (→ mediatype=sticker) but encodes only field 134 + context", () => {
    expect(msg.stickerMessage).toBeTruthy(); // what getMediaType() reads
    const bytes = Buffer.from(proto.Message.encode(msg).finish());
    expect(fieldNumbers(bytes).sort((a, b) => a - b)).toEqual([35, AUDIO_STICKER_FIELD]);
    expect(dig(bytes, AUDIO_STICKER_FIELD).equals(payload)).toBe(true);
  });

  it("survives Baileys' deviceSentMessage wrapping (own devices)", () => {
    const bytes = Buffer.from(
      proto.Message.encode({ deviceSentMessage: { destinationJid: "x@lid", message: msg } }).finish(),
    );
    expect(dig(bytes, 31, 2, AUDIO_STICKER_FIELD, 1, 26, 26).length).toBeGreaterThan(10);
  });

  it("plain messages unaffected; install is idempotent", () => {
    installRawEncode();
    const plain = Buffer.from(proto.Message.encode({ conversation: "hola" }).finish());
    expect(fieldNumbers(plain)).toEqual([1]);
  });
});
