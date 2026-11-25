import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { downloadContentFromMessage, type MediaType, type proto, type WAMessage } from "baileys";
import { run } from "../../utils/ffmpeg.js";
import { sniffExtension } from "./mediaExtract.js";
import {
  registerStickerPackMedia,
  STICKER_PACK_THUMB_TYPE,
  STICKER_PACK_TYPE,
  setThumbHkdf,
  THUMB_HKDF_CANDIDATES,
} from "./stickerPackMedia.js";

type Download = (msg: { mediaKey?: Uint8Array | null; directPath?: string | null }, type: MediaType) => Promise<Buffer>;

const defaultDownload: Download = async (m, type) => {
  const stream = await downloadContentFromMessage(m, type);
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
};

const replacer = (_k: string, v: unknown) =>
  typeof v === "bigint" ? v.toString() : v instanceof Uint8Array ? Buffer.from(v).toString("base64") : v;

/**
 * Reverse-engineering aid for sticker packs: saves the StickerPackMessage,
 * decrypts the pack ZIP and lists it, and probes which HKDF decrypts the
 * thumbnail. Output holds media keys → captures/ is git-ignored.
 */
export async function savePackCapture(
  rootDir: string,
  msg: WAMessage,
  download: Download = defaultDownload,
): Promise<{ dir: string; report: Record<string, unknown> }> {
  registerStickerPackMedia();
  const pack = msg.message?.stickerPackMessage as proto.Message.IStickerPackMessage;
  const dir = join(
    rootDir,
    `pack-${new Date().toISOString().replace(/[:.]/g, "-")}-${(msg.key.id ?? "x").replace(/\W/g, "")}`,
  );
  await mkdir(dir, { recursive: true });
  const report: Record<string, unknown> = {
    name: pack.name,
    publisher: pack.publisher,
    stickers: pack.stickers?.length ?? 0,
    origin: pack.stickerPackOrigin,
    trayIconFileName: pack.trayIconFileName,
  };

  // 1) the pack ZIP
  try {
    const zip = await download(
      { mediaKey: pack.mediaKey, directPath: pack.directPath },
      STICKER_PACK_TYPE as MediaType,
    );
    await writeFile(join(dir, "pack.zip"), zip);
    report.zip = {
      bytes: zip.length,
      isZip: zip.subarray(0, 2).toString() === "PK",
      hkdf: "WhatsApp Sticker Pack Keys",
    };
    const { stdout } = await run("unzip", ["-l", join(dir, "pack.zip")]);
    await writeFile(join(dir, "zip-listing.txt"), stdout);
    report.zipListing = stdout
      .split("\n")
      .slice(3, -3)
      .map((l) => l.trim())
      .filter(Boolean);
    const contents = await run("unzip", ["-p", join(dir, "pack.zip"), "contents.json"]).catch(() => null);
    if (contents?.stdout) report.contentsJson = contents.stdout.slice(0, 4000);
  } catch (err) {
    report.zipError = String(err);
  }

  // 2) the thumbnail: which HKDF decrypts it (shares the pack mediaKey)?
  if (pack.thumbnailDirectPath) {
    for (const candidate of THUMB_HKDF_CANDIDATES) {
      setThumbHkdf(candidate);
      try {
        const img = await download(
          { mediaKey: pack.mediaKey, directPath: pack.thumbnailDirectPath },
          STICKER_PACK_THUMB_TYPE as MediaType,
        );
        const ext = sniffExtension(img);
        if (ext !== "bin") {
          await writeFile(join(dir, `thumbnail.${ext}`), img);
          report.thumbnail = { hkdf: `WhatsApp ${candidate} Keys`, format: ext, bytes: img.length };
          break;
        }
      } catch {
        // wrong key → next
      }
    }
    report.thumbnail ??= "no candidate decrypted it";
  }

  await writeFile(join(dir, "stickerPackMessage.json"), JSON.stringify(pack, replacer, 2));
  await writeFile(join(dir, "report.json"), JSON.stringify(report, null, 2));
  return { dir, report };
}
