import { createHash } from "node:crypto";
import { UserInputError } from "../errors.js";

/**
 * WhatsApp sticker metadata lives in the WebP EXIF chunk: a minimal TIFF
 * header with one IFD entry, tag 0x5741 ("WA"), type UNDEFINED, whose value
 * is a JSON blob. This is the de-facto format used by WhatsApp's own sticker
 * apps and libraries such as wa-sticker-formatter.
 */
export interface StickerMetadata {
  packId: string;
  packName: string;
  publisher: string;
  emojis: string[];
}

export type StickerMetadataInput = Partial<StickerMetadata>;

/**
 * Shown by WhatsApp when someone taps the sticker («pack • autor»). By
 * default it invites whoever receives it to make their own: «Busca o crea más
 * en • estampido.isrradev.com». Mirrored in the HTTP contract (tested).
 */
export const DEFAULT_METADATA = { packName: "Busca o crea más en", publisher: "estampido.isrradev.com" } as const;
const MAX_TEXT = 128;
const MAX_EMOJIS = 3;
const WA_TAG = 0x5741;

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars is the point
const CONTROL = /[\u0000-\u001f\u007f]/g;
const clean = (s: string | undefined, field: string): string | undefined => {
  if (s === undefined) return undefined;
  const v = s.replace(CONTROL, "").trim();
  if (v.length > MAX_TEXT) throw new UserInputError(`${field} admite máximo ${MAX_TEXT} caracteres.`);
  return v || undefined;
};

/** Validate/normalize user input and fill defaults (stable packId per name+publisher). */
export function resolveMetadata(input: StickerMetadataInput = {}): StickerMetadata {
  const packName = clean(input.packName, "El nombre del pack") ?? DEFAULT_METADATA.packName;
  const publisher = clean(input.publisher, "El autor") ?? DEFAULT_METADATA.publisher;
  const emojis = (input.emojis ?? []).map((e) => e.trim()).filter(Boolean);
  if (emojis.length > MAX_EMOJIS) throw new UserInputError(`Máximo ${MAX_EMOJIS} emojis.`);
  for (const e of emojis) {
    if (!/^\p{Extended_Pictographic}/u.test(e) || [...e].length > 8) {
      throw new UserInputError(`"${e}" no es un emoji válido.`);
    }
  }
  const packId =
    clean(input.packId, "El id del pack") ??
    createHash("sha256").update(`${packName}\n${publisher}`).digest("hex").slice(0, 32);
  return { packId, packName, publisher, emojis };
}

/** Raw EXIF payload (TIFF, little-endian) carrying the metadata JSON. */
export function buildStickerExif(meta: StickerMetadata): Buffer {
  const json = Buffer.from(
    JSON.stringify({
      "sticker-pack-id": meta.packId,
      "sticker-pack-name": meta.packName,
      "sticker-pack-publisher": meta.publisher,
      emojis: meta.emojis,
    }),
    "utf8",
  );
  const header = Buffer.alloc(22);
  header.write("II", 0, "ascii"); // little-endian
  header.writeUInt16LE(42, 2); // TIFF magic
  header.writeUInt32LE(8, 4); // IFD0 offset
  header.writeUInt16LE(1, 8); // 1 entry
  header.writeUInt16LE(WA_TAG, 10);
  header.writeUInt16LE(7, 12); // UNDEFINED
  header.writeUInt32LE(json.length, 14); // count
  header.writeUInt32LE(22, 18); // value offset (right after header)
  return Buffer.concat([header, json]);
}

/** Inverse of buildStickerExif; null if this EXIF isn't WhatsApp sticker metadata. */
export function parseStickerExif(exif: Buffer): StickerMetadata | null {
  if (exif.length < 22 || exif.toString("ascii", 0, 2) !== "II") return null;
  const entries = exif.readUInt16LE(exif.readUInt32LE(4));
  for (let i = 0; i < entries; i++) {
    const at = exif.readUInt32LE(4) + 2 + i * 12;
    if (at + 12 > exif.length || exif.readUInt16LE(at) !== WA_TAG) continue;
    const len = exif.readUInt32LE(at + 4);
    const off = exif.readUInt32LE(at + 8);
    try {
      const j = JSON.parse(exif.toString("utf8", off, off + len));
      return {
        packId: String(j["sticker-pack-id"] ?? ""),
        packName: String(j["sticker-pack-name"] ?? ""),
        publisher: String(j["sticker-pack-publisher"] ?? ""),
        emojis: Array.isArray(j.emojis) ? j.emojis.map(String) : [],
      };
    } catch {
      return null;
    }
  }
  return null;
}
