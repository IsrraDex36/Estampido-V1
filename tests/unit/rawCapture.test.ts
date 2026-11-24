import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { proto, type WAMessage } from "baileys";
import { describe, expect, it } from "vitest";
import { saveCapture } from "../../src/adapters/bot/capture.js";
import { findMediaCandidates, sniffExtension } from "../../src/adapters/bot/mediaExtract.js";
import { installRawCapture, takeRawFor } from "../../src/adapters/bot/rawCapture.js";
import { encodeBytesField } from "../../src/utils/protobufRaw.js";

/** Simulated sound sticker: field 134 → FutureProof{1: Message{stickerMessage, ?}}. */
function fakeSoundSticker(): Buffer {
  const inner = Buffer.from(
    proto.Message.encode({
      stickerMessage: {
        url: "https://mmg.whatsapp.net/v/t62.15575-24/abc.enc",
        directPath: "/v/t62.15575-24/abc.enc",
        mimetype: "image/webp",
        mediaKey: Buffer.alloc(32, 7),
        fileSha256: Buffer.alloc(32, 1),
        isAnimated: true,
      },
    }).finish(),
  );
  return encodeBytesField(134, encodeBytesField(1, inner));
}

describe("installRawCapture", () => {
  installRawCapture();

  it("keeps raw bytes when Baileys drops field 134", () => {
    const decoded = proto.Message.decode(fakeSoundSticker());
    expect(Object.keys(decoded.toJSON())).toEqual([]);
    const raw = takeRawFor(decoded);
    expect(raw?.droppedTopLevel).toEqual([134]);
    expect(raw?.droppedBytes).toBeGreaterThan(50);
    expect(takeRawFor(decoded)).toBeDefined(); // symbol still attached
  });

  it("ignores lossless messages", () => {
    const decoded = proto.Message.decode(proto.Message.encode({ conversation: "hola" }).finish());
    expect(takeRawFor(decoded)).toBeUndefined();
  });

  it("is idempotent", () => {
    installRawCapture();
    expect(proto.Message.decode(proto.Message.encode({ conversation: "x" }).finish()).conversation).toBe("x");
  });
});

describe("findMediaCandidates", () => {
  it("finds nested sticker media with url, mimetype and 32-byte key candidates", () => {
    const [c] = findMediaCandidates(fakeSoundSticker());
    expect(c?.path).toBe("134.1.26");
    expect(c?.mimetype).toBe("image/webp");
    expect(c?.directPath).toMatch(/^\/v\/t62/);
    expect(c?.keyCandidates).toHaveLength(2); // mediaKey + fileSha256
  });

  it("sniffs formats", () => {
    expect(sniffExtension(Buffer.from("OggS...."))).toBe("ogg");
    expect(sniffExtension(Buffer.from("RIFF\0\0\0\0WEBP"))).toBe("webp");
    expect(sniffExtension(Buffer.from("????"))).toBe("bin");
  });
});

describe("saveCapture", () => {
  it("saves downloaded media next to the capture", async () => {
    const root = await mkdtemp(join(tmpdir(), "sva-cap-"));
    try {
      const raw = fakeSoundSticker();
      const msg = { key: { id: "M" }, message: {} } as WAMessage;
      const data = Buffer.from("RIFF\0\0\0\0WEBPVP8X");
      const dir = await saveCapture(root, msg, { raw, droppedTopLevel: [134], droppedBytes: 1, at: 0 }, async (c) => ({
        path: c.path,
        mediaType: "sticker",
        ext: "webp",
        data,
      }));
      expect(await readdir(dir)).toContain("media-134_1_26.webp");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("writes raw.bin + capture.json with Baileys' view of the inner message", async () => {
    const root = await mkdtemp(join(tmpdir(), "sva-cap-"));
    try {
      const raw = fakeSoundSticker();
      const msg = {
        key: { id: "ABC", remoteJid: "1@s.whatsapp.net", fromMe: false },
        message: {},
      } as WAMessage;
      const entry = {
        raw,
        droppedTopLevel: [134],
        droppedBytes: raw.length,
        at: Date.now(),
      };
      const dir = await saveCapture(root, msg, entry, async () => null); // no network in unit tests
      expect((await readdir(dir)).sort()).toEqual(["capture.json", "raw.bin"]);
      const json = JSON.parse(await readFile(join(dir, "capture.json"), "utf8"));
      expect(json.droppedTopLevelFields).toEqual([134]);
      expect(json.innerDecodedByBaileys["134"].stickerMessage.mimetype).toBe("image/webp");
      expect(json.media[0]).toMatchObject({
        path: "134.1.26",
        downloaded: null,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
