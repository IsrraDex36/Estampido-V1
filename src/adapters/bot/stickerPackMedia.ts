import { MEDIA_HKDF_KEY_MAPPING, MEDIA_PATH_MAP } from "baileys";

/**
 * WhatsApp sticker packs travel as one encrypted ZIP (+ an encrypted
 * thumbnail). Baileys 7.0.0-rc14 doesn't know these media types, so they are
 * registered at runtime. Encryption info resolves to
 * "WhatsApp Sticker Pack Keys" (all community sources agree once Baileys'
 * `WhatsApp ${x} Keys` template is applied). The upload path differs between
 * sources ("/mms/sticker-pack" vs "/mms/sticker") — confirm with a capture.
 */
export const STICKER_PACK_TYPE = "sticker-pack";
export const STICKER_PACK_THUMB_TYPE = "thumbnail-sticker-pack";

/** Candidate HKDF names for the pack thumbnail (unconfirmed; capture tells). */
export const THUMB_HKDF_CANDIDATES = ["Sticker Pack Thumbnail", "Sticker Pack", "Image Thumbnail", "Image"] as const;

type Mutable = Record<string, string>;

export function registerStickerPackMedia(uploadPath = "/mms/sticker-pack"): void {
  const hkdf = MEDIA_HKDF_KEY_MAPPING as unknown as Mutable;
  const paths = MEDIA_PATH_MAP as unknown as Mutable;
  hkdf[STICKER_PACK_TYPE] ??= "Sticker Pack";
  paths[STICKER_PACK_TYPE] ??= uploadPath;
}

/** Temporarily point the thumbnail type at one HKDF candidate (capture probing). */
export function setThumbHkdf(name: string): void {
  (MEDIA_HKDF_KEY_MAPPING as unknown as Mutable)[STICKER_PACK_THUMB_TYPE] = name;
}
