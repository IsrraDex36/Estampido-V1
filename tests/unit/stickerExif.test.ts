import { describe, expect, it } from "vitest";
import { UserInputError } from "../../src/core/errors.js";
import {
  buildStickerExif,
  DEFAULT_METADATA,
  parseStickerExif,
  resolveMetadata,
} from "../../src/core/metadata/stickerExif.js";
import { embedExif, readChunks, readExif, writeChunks } from "../../src/core/webp/chunks.js";
import { inspectWebp } from "../../src/core/webp/inspect.js";

describe("resolveMetadata", () => {
  it("fills defaults with a stable pack id", () => {
    const a = resolveMetadata();
    expect(a).toMatchObject({ ...DEFAULT_METADATA, emojis: [] });
    expect(a.packId).toMatch(/^[0-9a-f]{32}$/);
    expect(resolveMetadata().packId).toBe(a.packId);
    expect(resolveMetadata({ packName: "Otro" }).packId).not.toBe(a.packId);
  });
  it("strips control chars and blank → default", () => {
    expect(resolveMetadata({ packName: " Mis\u0000 memes\n ", publisher: "   " })).toMatchObject({
      packName: "Mis memes",
      publisher: DEFAULT_METADATA.publisher,
    });
  });
  it("validates length and emojis", () => {
    expect(() => resolveMetadata({ packName: "x".repeat(129) })).toThrow(UserInputError);
    expect(() => resolveMetadata({ emojis: ["😂", "🔥", "🎉", "👍"] })).toThrow(/Máximo 3/);
    expect(() => resolveMetadata({ emojis: ["abc"] })).toThrow(/no es un emoji/);
    expect(resolveMetadata({ emojis: ["😂", " 🔊 "] }).emojis).toEqual(["😂", "🔊"]);
  });
});

describe("EXIF payload", () => {
  it("has the WhatsApp layout and round-trips (incl. unicode)", () => {
    const meta = resolveMetadata({ packName: "Pack ñandú 🎵", publisher: "Isra", emojis: ["🔊"] });
    const exif = buildStickerExif(meta);
    expect(exif.toString("hex", 0, 14)).toBe("49492a000800000001004157" + "0700");
    expect(exif.readUInt32LE(18)).toBe(22);
    expect(JSON.parse(exif.toString("utf8", 22))).toEqual({
      "sticker-pack-id": meta.packId,
      "sticker-pack-name": "Pack ñandú 🎵",
      "sticker-pack-publisher": "Isra",
      emojis: ["🔊"],
    });
    expect(parseStickerExif(exif)).toEqual(meta);
  });
  it("parse rejects foreign EXIF", () => {
    expect(parseStickerExif(Buffer.from("MM\0*garbage-garbage-garbage"))).toBeNull();
  });
});

/** Minimal simple-lossless WebP (VP8L) 2×3 with alpha bit, fake bitstream. */
function fakeVp8l(): Buffer {
  const data = Buffer.alloc(10);
  data.writeUInt8(0x2f, 0);
  data.writeUInt32LE((2 - 1) | ((3 - 1) << 14) | (1 << 28), 1);
  return writeChunks([{ fourcc: "VP8L", data }]);
}

describe("embedExif", () => {
  const exif = buildStickerExif(resolveMetadata());

  it("upgrades simple WebP to VP8X with EXIF + alpha flags and correct canvas", () => {
    const out = embedExif(fakeVp8l(), exif);
    expect(readChunks(out).map((c) => c.fourcc)).toEqual(["VP8X", "VP8L", "EXIF"]);
    const info = inspectWebp(out);
    expect(info).toMatchObject({ canvasWidth: 2, canvasHeight: 3, hasExif: true, hasAlpha: true });
    expect(out.readUInt32LE(4)).toBe(out.length - 8);
    expect(readExif(out)?.equals(exif)).toBe(true);
  });

  it("replaces an existing EXIF and keeps it before XMP", () => {
    const withXmp = writeChunks([
      ...readChunks(embedExif(fakeVp8l(), exif)),
      { fourcc: "XMP ", data: Buffer.from("<x/>") },
    ]);
    const other = buildStickerExif(resolveMetadata({ packName: "B" }));
    const out = embedExif(withXmp, other);
    const fourccs = readChunks(out).map((c) => c.fourcc);
    expect(fourccs.filter((f) => f === "EXIF")).toHaveLength(1);
    expect(fourccs.slice(-2)).toEqual(["EXIF", "XMP "]);
    expect(parseStickerExif(readExif(out) as Buffer)?.packName).toBe("B");
  });

  it("pads odd-sized chunks", () => {
    const odd = Buffer.concat([exif, Buffer.from(" ")]).subarray(0, exif.length | 1);
    const out = embedExif(fakeVp8l(), odd);
    expect(out.length % 2).toBe(0);
    expect(readExif(out)?.length).toBe(odd.length);
  });
});
