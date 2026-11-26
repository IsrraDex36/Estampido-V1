import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildStickerExif, resolveMetadata, type StickerMetadata } from "../../../core/metadata/stickerExif.js";
import { embedExif } from "../../../core/webp/chunks.js";
import { PACK_STICKER_PUBLISHER } from "../contract.js";

/**
 * Stickers sent as part of a pack always carry the app's mark: in WhatsApp's
 * sticker info they read «<pack> · @<creator> • Crea más en …». The pack
 * name/creator is the user's; the publisher line is fixed by the app (not
 * editable). Same pack id for every sticker of the pack, so WhatsApp groups
 * them. Applied to a copy: the published sticker is never modified.
 */
export function packMetadata(pack: { name: string; owner: { handle: string } }): StickerMetadata {
  const packName = `${pack.name} · @${pack.owner.handle}`.slice(0, 128);
  return resolveMetadata({ packName, publisher: PACK_STICKER_PUBLISHER });
}

/** Write `webpPath` re-stamped with the pack's metadata into `dir`; returns the new path. */
export async function stampForPack(
  webpPath: string,
  pack: { name: string; owner: { handle: string } },
  dir: string,
): Promise<string> {
  const bytes = await readFile(webpPath);
  const out = join(dir, "sticker.webp");
  await writeFile(out, embedExif(bytes, buildStickerExif(packMetadata(pack))));
  return out;
}
