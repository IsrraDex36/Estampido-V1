import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getContentType, proto, type WAMessage } from "baileys";
import { decodeRaw, rawTree } from "../../utils/protobufRaw.js";
import { downloadCandidate, type ExtractedMedia, findMediaCandidates, type MediaCandidate } from "./mediaExtract.js";
import type { RawDecode } from "./rawCapture.js";

const replacer = (_k: string, v: unknown) =>
  typeof v === "bigint" ? v.toString() : v instanceof Uint8Array ? Buffer.from(v).toString("base64") : v;

/**
 * Persist everything needed to reverse-engineer a message Baileys can't parse:
 * raw bytes, a schema-less tree, Baileys' partial view, and any media
 * (sticker + audio) found anywhere in the tree.
 *
 * Output contains media keys → treat captures/ as private (git-ignored).
 */
export async function saveCapture(
  rootDir: string,
  msg: WAMessage,
  raw: RawDecode,
  download: (c: MediaCandidate) => Promise<ExtractedMedia | null> = downloadCandidate,
): Promise<string> {
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${(msg.key.id ?? "noid").replace(/[^\w-]/g, "")}`;
  const dir = join(rootDir, id);
  await mkdir(dir, { recursive: true });

  // Baileys' view of each FutureProofMessage-shaped unknown field (field 1 = inner Message).
  const innerDecoded: Record<string, unknown> = {};
  for (const f of decodeRaw(raw.raw)) {
    if (!raw.droppedTopLevel.includes(f.field) || f.wire !== 2) continue;
    try {
      const wrapper = decodeRaw(f.value as Buffer).find((x) => x.field === 1 && x.wire === 2);
      if (wrapper) innerDecoded[f.field] = proto.Message.decode(wrapper.value as Buffer).toJSON();
    } catch {
      innerDecoded[f.field] = "not a FutureProofMessage";
    }
  }

  const media = [];
  for (const candidate of findMediaCandidates(raw.raw)) {
    const got = await download(candidate);
    const entry = {
      path: candidate.path,
      mimetype: candidate.mimetype,
      hasUrl: Boolean(candidate.url),
      hasDirectPath: Boolean(candidate.directPath),
      keyCandidates: candidate.keyCandidates.length,
      downloaded: got
        ? {
            file: `media-${candidate.path.replace(/\W/g, "_")}.${got.ext}`,
            mediaType: got.mediaType,
            bytes: got.data.length,
          }
        : null,
    };
    if (got && entry.downloaded) await writeFile(join(dir, entry.downloaded.file), got.data);
    media.push(entry);
  }

  const summary = {
    capturedAt: new Date().toISOString(),
    key: {
      id: msg.key.id,
      fromMe: msg.key.fromMe,
      remoteJid: msg.key.remoteJid,
    },
    baileysContentType: getContentType(msg.message ?? undefined) ?? null,
    droppedTopLevelFields: raw.droppedTopLevel,
    droppedBytes: raw.droppedBytes,
    rawBytes: raw.raw.length,
    innerDecodedByBaileys: innerDecoded,
    media,
    tree: rawTree(raw.raw),
  };
  await writeFile(join(dir, "raw.bin"), raw.raw);
  await writeFile(join(dir, "capture.json"), JSON.stringify(summary, replacer, 2));
  return dir;
}
